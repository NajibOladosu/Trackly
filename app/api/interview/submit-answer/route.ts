import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { evaluateInterviewAnswer } from '@/shared/infrastructure/ai'
import { createAnswer, getInterviewQuestion } from '@/modules/interviews/services/interview.service'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import { validateString, MAX_LENGTHS } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/**
 * POST /api/interview/submit-answer
 *
 * Submit an answer to an interview question and receive AI evaluation.
 * Currently supports text answers only. Voice support will be added later.
 *
 * Body:
 * - questionId: string (required)
 * - sessionId: string (required)
 * - answerText: string (required)
 * - answerType: 'text' | 'voice' (required, only 'text' supported for now)
 * - timeTakenSeconds: number (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting
    const rateLimitResponse = await rateLimitMiddleware(
      request,
      RATE_LIMITS.ai,
      async () => user.id
    )
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const body = await request.json()
    const { questionId, sessionId, answerText, answerType = 'text', timeTakenSeconds } = body

    // Validation
    if (!questionId || !sessionId || !answerText) {
      return NextResponse.json(
        { error: 'Missing required fields: questionId, sessionId, answerText' },
        { status: 400 }
      )
    }

    if (answerType !== 'text' && answerType !== 'voice') {
      return NextResponse.json(
        { error: 'answerType must be "text" or "voice"' },
        { status: 400 }
      )
    }

    if (answerType === 'voice') {
      return NextResponse.json(
        { error: 'Voice answers are not yet supported. Please use text for now.' },
        { status: 400 }
      )
    }

    if (!answerText || answerText.trim().length === 0) {
      return NextResponse.json({ error: 'Answer text cannot be empty' }, { status: 400 })
    }

    const answerErr = validateString(answerText, 'answerText', { maxLength: MAX_LENGTHS.answerText })
    if (answerErr) return NextResponse.json({ error: answerErr }, { status: 400 })

    // Fetch question with verification
    const question = await getInterviewQuestion(questionId, supabase)

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    if (question.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }


    if (question.session_id !== sessionId) {
      return NextResponse.json({ error: 'Question does not belong to this session' }, { status: 400 })
    }

    // Evaluate answer using AI
    const evaluation = await evaluateInterviewAnswer({
      question: question.question_text,
      answer: answerText.trim(),
      questionCategory: question.question_category,
      idealOutline: question.ideal_answer_outline || undefined,
      evaluationCriteria: question.evaluation_criteria || undefined,
      answerType,
    })

    // Save answer to database
    const answer = await createAnswer({
      question_id: questionId,
      session_id: sessionId,
      answer_text: answerText.trim(),
      answer_type: answerType,
      score: evaluation.score,
      feedback: evaluation.feedback,
      clarity_score: evaluation.clarity_score,
      structure_score: evaluation.structure_score,
      relevance_score: evaluation.relevance_score,
      depth_score: evaluation.depth_score,
      confidence_score: evaluation.confidence_score,
      time_taken_seconds: timeTakenSeconds || undefined,
      audio_url: undefined,
      audio_duration_seconds: undefined,
      transcription_confidence: undefined,
    }, supabase)

    return NextResponse.json(
      {
        answer,
        evaluation,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error submitting interview answer:', error)
    return NextResponse.json(
      { error: 'Failed to submit answer' },
      { status: 500 }
    )
  }
}
