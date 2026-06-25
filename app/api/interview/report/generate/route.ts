import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { callGeminiWithFallback } from '@/shared/infrastructure/ai'
import { AIRateLimitError } from '@/shared/infrastructure/ai/model-manager'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import type { InterviewSession, InterviewQuestion, InterviewAnswer } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/interview/report/generate
 *
 * Generates AI-powered interview report from conversation transcript
 * - Analyzes user responses against pre-generated questions
 * - Scores each answer with detailed feedback
 * - Stores results in interview_answers table
 * - Updates session statistics
 *
 * Request body:
 * {
 *   sessionId: string
 * }
 *
 * Response:
 * {
 *   reportData: {
 *     session: InterviewSession
 *     questions: InterviewQuestion[]
 *     answers: InterviewAnswer[]
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResponse = await rateLimitMiddleware(request, RATE_LIMITS.ai, async () => user.id)
    if (rateLimitResponse) return rateLimitResponse

    // Parse request
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    // Get session
    const { data: session, error: sessionError } = await supabase
      .from('interview_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Get questions
    const { data: questions, error: questionsError } = await supabase
      .from('interview_questions')
      .select('*')
      .eq('session_id', sessionId)
      .order('question_order')

    if (questionsError || !questions || questions.length === 0) {
      return NextResponse.json({ error: 'Questions not found' }, { status: 404 })
    }

    // Get conversation turns
    const { data: turns, error: turnsError } = await supabase
      .from('conversation_turns')
      .select('*')
      .eq('session_id', sessionId)
      .order('turn_number')

    if (turnsError || !turns) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Check if report already exists
    const { data: existingAnswers } = await supabase
      .from('interview_answers')
      .select('id')
      .eq('session_id', sessionId)
      .limit(1)

    if (existingAnswers && existingAnswers.length > 0) {
      // Report already exists, return it
      return await getExistingReport(supabase, sessionId, session, questions)
    }

    // Extract user responses (filter for user turns only)
    const userTurns = turns.filter((t) => t.speaker === 'user')

    console.log(`Generating report for session ${sessionId}: ${userTurns.length} user responses, ${questions.length} questions`)

    // Score each answer
    const answers: InterviewAnswer[] = []
    let totalScore = 0

    for (let i = 0; i < Math.min(userTurns.length, questions.length); i++) {
      const question = questions[i]
      const userTurn = userTurns[i]

      try {
        // Generate scoring prompt (matches enhanced evaluateInterviewAnswer format)
        const prompt = `You are an expert interview evaluator. Score the following answer to an interview question.

Question:
${question.question_text}

Category: ${question.question_category}
Difficulty: ${question.difficulty}

${question.ideal_answer_outline ? `Ideal Answer Guidance:\n${JSON.stringify(question.ideal_answer_outline, null, 2)}\n` : ''}${question.evaluation_criteria ? `Evaluation Criteria:\n${JSON.stringify(question.evaluation_criteria, null, 2)}\n` : ''}
Candidate's Answer (transcribed from voice):
${userTurn.content}

CRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE:
1. You MUST provide ALL 5 individual scores (clarity, structure, relevance, depth, confidence)
2. Each score MUST be a decimal number between 0.00 and 10.00 (e.g., 7.5, 8.2, 9.1)
3. You MUST provide detailed feedback with:
   - overall: 2-3 sentences summarizing the answer quality
   - strengths: ONLY if score >= 5.0 (provide 2-3 specific positive aspects)
   - weaknesses: ONLY if score < 7.0 (provide 2-3 specific areas for improvement)
   - suggestions: Always provide 2-3 actionable recommendations
   - tone_analysis: 1-2 sentences analyzing communication style and delivery

4. Be SPECIFIC - reference actual content from the candidate's answer
5. Be HONEST - if an answer is poor (score < 5), don't force strengths. If excellent (score >= 7), don't force weaknesses.
6. Suggestions should always be provided regardless of score
7. All feedback must be constructive and helpful

Evaluate across 5 dimensions (each scored 0.00 to 10.00):
1. **Clarity** (0-10): How clear and understandable is the answer?
2. **Structure** (0-10): How well-organized is the answer?
3. **Relevance** (0-10): How directly does it address the question?
4. **Depth** (0-10): How detailed and thorough is the answer?
5. **Confidence** (0-10): How confident did they sound in their voice delivery?

Return ONLY valid JSON (no markdown, no code fences):

{
  "overall_score": <decimal 0.00-10.00 (average of the 5 dimensions)>,
  "clarity_score": <decimal 0.00-10.00>,
  "structure_score": <decimal 0.00-10.00>,
  "relevance_score": <decimal 0.00-10.00>,
  "depth_score": <decimal 0.00-10.00>,
  "confidence_score": <decimal 0.00-10.00>,
  "feedback": {
    "overall": "2-3 sentence summary of the answer quality",
    "strengths": [
      // ONLY include if overall score >= 5.0
      // If score < 5.0, return empty array []
      "Specific strength 1 with reference to answer content",
      "Specific strength 2"
    ],
    "weaknesses": [
      // ONLY include if overall score < 7.0
      // If score >= 7.0, return empty array []
      "Specific area for improvement 1",
      "Specific area for improvement 2"
    ],
    "suggestions": [
      // ALWAYS provide suggestions regardless of score
      "Actionable suggestion 1 to improve the answer",
      "Actionable suggestion 2"
    ],
    "tone_analysis": "1-2 sentences analyzing communication style and delivery"
  }
}

SCORING GUIDELINES:
- Score < 5.0: Poor answer - provide weaknesses and suggestions, skip strengths
- Score 5.0-6.9: Average answer - provide strengths, weaknesses, and suggestions
- Score >= 7.0: Good answer - provide strengths and suggestions, skip weaknesses

Be honest with your scoring. Don't inflate or deflate scores.`

        const responseText = await callGeminiWithFallback(prompt, 'SIMPLE')

        // Parse JSON response (strip markdown if present)
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText]
        const jsonText = jsonMatch[1]?.trim() || responseText.trim()
        const evaluation = JSON.parse(jsonText)

        // Store answer in database
        const { data: answer, error: answerError } = await supabase
          .from('interview_answers')
          .insert({
            question_id: question.id,
            session_id: sessionId,
            user_id: user.id,
            answer_text: userTurn.content,
            answer_type: 'voice',
            audio_url: userTurn.audio_url,
            audio_duration_seconds: userTurn.audio_duration_seconds,
            score: evaluation.overall_score,
            feedback: evaluation.feedback,
            clarity_score: evaluation.clarity_score,
            structure_score: evaluation.structure_score,
            relevance_score: evaluation.relevance_score,
            depth_score: evaluation.depth_score,
            confidence_score: evaluation.confidence_score,  // Now included
            answered_at: userTurn.timestamp,
          })
          .select()
          .single()

        if (answerError) {
          console.error('Error storing answer:', answerError)
          throw answerError
        }

        answers.push(answer)
        totalScore += evaluation.overall_score

        console.log(`Scored Q${i + 1}: ${evaluation.overall_score}/10`)
      } catch (error) {
        if (error instanceof AIRateLimitError) {
          throw error
        }
        console.error(`Error scoring question ${i + 1}:`, error)
        // Continue with other questions
      }
    }

    // Calculate average score
    const averageScore = answers.length > 0 ? totalScore / answers.length : 0

    // Update session with statistics
    await supabase
      .from('interview_sessions')
      .update({
        answered_questions: answers.length,
        average_score: averageScore,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    console.log(`Report generated: ${answers.length} answers, average score: ${averageScore.toFixed(2)}`)

    // Fetch updated session
    const { data: updatedSession } = await supabase
      .from('interview_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    return NextResponse.json(
      {
        reportData: {
          session: updatedSession || session,
          questions,
          answers,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof AIRateLimitError) {
      const retryAfter = Math.max(1, Math.ceil((error.nextAvailableTime - Date.now()) / 1000))
      return NextResponse.json(
        { error: error.message, retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }
    console.error('Error generating interview report:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Helper function to get existing report
 */
async function getExistingReport(supabase: SupabaseClient, sessionId: string, session: InterviewSession, questions: InterviewQuestion[]) {
  const { data: answers } = await supabase
    .from('interview_answers')
    .select('*')
    .eq('session_id', sessionId)
    .order('answered_at')

  return NextResponse.json(
    {
      reportData: {
        session,
        questions,
        answers: answers || [],
      },
    },
    { status: 200 }
  )
}
