import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { getQuestionsForSession } from '@/modules/interviews/services/interview.service'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import { validateString, MAX_LENGTHS } from '@/lib/validation'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const rateLimitResponse = await rateLimitMiddleware(request, RATE_LIMITS.ai, async () => user.id)
        if (rateLimitResponse) return rateLimitResponse

        const body = await request.json()
        const {
            sessionId,
            questionIndex,
            userAnswer,
            overallScore,
            clarityScore,
            structureScore,
            relevanceScore,
            depthScore,
            confidenceScore,
            overallFeedback,
            strengths,
            weaknesses,
            suggestions,
            toneAnalysis
        } = body

        if (!sessionId || questionIndex === undefined || !userAnswer) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        const answerErr = validateString(userAnswer, 'userAnswer', { maxLength: MAX_LENGTHS.userAnswer })
        if (answerErr) return NextResponse.json({ error: answerErr }, { status: 400 })

        // 1. Get questions for session to map index to ID
        const questions = await getQuestionsForSession(sessionId, supabase)

        // questionIndex is 1-based (from AI), array is 0-based
        const question = questions[questionIndex - 1]

        if (!question) {
            console.error(`Question not found for index ${questionIndex} in session ${sessionId}`)
            return NextResponse.json(
                { error: 'Question not found' },
                { status: 404 }
            )
        }

        // 2. Save answer with complete feedback structure
        const { error: insertError } = await supabase.from('interview_answers').insert({
            session_id: sessionId,
            question_id: question.id,
            user_id: user.id,
            answer_text: userAnswer,
            audio_url: null,
            answer_type: 'voice',
            transcription_confidence: 1.0,
            // Overall score
            score: overallScore,
            // Individual scores
            clarity_score: clarityScore,
            structure_score: structureScore,
            relevance_score: relevanceScore,
            depth_score: depthScore,
            confidence_score: confidenceScore,
            // Complete feedback structure
            feedback: {
                overall: overallFeedback,
                strengths: strengths || [],
                weaknesses: weaknesses || [],
                suggestions: suggestions || [],
                tone_analysis: toneAnalysis
            },
        })

        if (insertError) {
            console.error('Error saving answer:', insertError)
            throw insertError
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
        console.error('Error in save-answer-v2:', error)
        return NextResponse.json(
            { error: 'Failed to save answer' },
            { status: 500 }
        )
    }
}
