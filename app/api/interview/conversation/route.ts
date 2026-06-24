import { NextRequest } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { ConversationManager, generateIntroductionPrompt, generateQuestionPrompt, generateConclusionPrompt, shouldAskFollowUp } from '@/modules/interviews/services/conversation.service'
import { getQuestionsForSession, getInterviewSession, updateInterviewSession, createQuestionsForSession } from '@/modules/interviews/services/interview.service'
import { generateInterviewQuestions, callGeminiWithFallback } from '@/shared/infrastructure/ai'
import { isGeminiConfigured } from '@/shared/infrastructure/ai/client'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import type { QuestionCategory, InterviewSession } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/interview/conversation
 * 
 * Real-time conversational interview using Server-Sent Events (SSE)
 * 
 * Body:
 * - sessionId: string (required)
 * - action: 'start' | 'respond' | 'end' (required)
 * - userResponse?: string (required for 'respond' action)
 */
export async function POST(request: NextRequest) {
    if (!isGeminiConfigured()) {
        return new Response(
            JSON.stringify({ error: 'AI is not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }

    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
        }

        const rateLimitResponse = await rateLimitMiddleware(request, RATE_LIMITS.ai, async () => user.id)
        if (rateLimitResponse) return rateLimitResponse

        const body = await request.json()
        const { sessionId, action, userResponse } = body

        if (!sessionId || !action) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: sessionId, action' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // Verify session belongs to user
        const session = await getInterviewSession(sessionId, supabase)
        if (session.user_id !== user.id) {
            console.error(`Unauthorized access attempt for session ${sessionId} by user ${user.id}`)
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 403, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // Get questions for this session
        let questions = await getQuestionsForSession(sessionId)
        console.log(`Found ${questions.length} questions for session ${sessionId}`)

        if (questions.length === 0) {
            console.warn(`No questions found for session ${sessionId}. Attempting to generate questions...`)

            // Fetch application details for context
            const { data: application } = await supabase
                .from('applications')
                .select('job_description, company')
                .eq('id', session.application_id)
                .single()

            try {
                // Generate questions using AI
                const aiQuestions = await generateInterviewQuestions({
                    sessionType: session.session_type as 'behavioral' | 'technical' | 'mixed',
                    difficulty: (session.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
                    questionCount: session.total_questions || 5, // Use user-selected count
                    jobDescription: application?.job_description || undefined,
                    companyName: session.company_name || application?.company || undefined,
                })

                if (aiQuestions.length > 0) {
                    // Save questions to database
                    questions = await createQuestionsForSession(
                        session.id,
                        aiQuestions.map((q, index) => ({
                            question_text: q.question_text,
                            question_category: q.question_category as QuestionCategory,
                            difficulty: q.difficulty as 'easy' | 'medium' | 'hard',
                            ideal_answer_outline: q.ideal_answer_outline,
                            evaluation_criteria: q.evaluation_criteria,
                            question_order: index + 1,
                            estimated_duration_seconds: q.estimated_duration_seconds,
                        })),
                        supabase
                    )
                    console.log(`Successfully generated and saved ${questions.length} questions`)
                } else {
                    throw new Error('AI generated empty questions list')
                }
            } catch (genError) {
                console.error('Failed to auto-generate questions:', genError)
                return new Response(
                    JSON.stringify({ error: 'No questions found and failed to generate new ones' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                )
            }
        }

        // Initialize conversation manager
        const manager = new ConversationManager(sessionId, questions, supabase)
        await manager.loadState()

        // Handle different actions
        switch (action) {
            case 'start':
                return await handleStart(session, manager, supabase)

            case 'respond':
                if (!userResponse) {
                    return new Response(
                        JSON.stringify({ error: 'userResponse is required for respond action' }),
                        { status: 400, headers: { 'Content-Type': 'application/json' } }
                    )
                }
                return await handleRespond(session, manager, userResponse, supabase)

            case 'end':
                return await handleEnd(session, manager, supabase)

            default:
                return new Response(
                    JSON.stringify({ error: 'Invalid action. Must be: start, respond, or end' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                )
        }
    } catch (error) {
        console.error('Error in conversation API:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
}

async function handleStart(session: InterviewSession, manager: ConversationManager, supabase: SupabaseClient) {
    // Check if conversation already started
    const state = manager.getState()
    const existingIntro = state.turns.find(t => t.metadata?.type === 'introduction')

    if (existingIntro) {
        // Resume existing conversation
        return new Response(
            JSON.stringify({
                type: 'introduction',
                content: existingIntro.content,
                state: manager.getState(),
                resumed: true
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    }

    // Generate AI introduction
    const introPrompt = generateIntroductionPrompt(
        session.company_name,
        session.session_type,
        session.difficulty || 'medium'
    )

    const introduction = await callGeminiWithFallback(introPrompt, 'SIMPLE')

    // Save AI introduction turn
    await manager.addTurn('ai', introduction, { type: 'introduction' })

    // Update session to mark conversation started
    await updateInterviewSession(session.id, {
        conversation_started_at: new Date().toISOString(),
        conversation_mode: true,
    }, supabase)

    return new Response(
        JSON.stringify({
            type: 'introduction',
            content: introduction,
            state: manager.getState(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
}

async function handleRespond(session: InterviewSession, manager: ConversationManager, userResponse: string, supabase: SupabaseClient) {
    console.log('handleRespond started', { sessionId: session.id, userResponseLength: userResponse.length })
    const state = manager.getState()

    // Save user response
    try {
        await manager.addTurn('user', userResponse)
        console.log('User turn saved')
    } catch (err) {
        console.error('Failed to save user turn:', err)
        throw err
    }

    // Check if this is response to introduction
    if (!state.isIntroductionComplete) {
        console.log('Handling introduction response')
        manager.markIntroductionComplete()

        // Ask first question
        const firstQuestion = manager.getCurrentQuestion()
        if (!firstQuestion) {
            console.error('No questions available for session', session.id)
            throw new Error('No questions available')
        }

        try {
            const questionPrompt = generateQuestionPrompt(firstQuestion)
            console.log('Generating first question with prompt length:', questionPrompt.length)
            const questionText = await callGeminiWithFallback(questionPrompt, 'SIMPLE')
            console.log('First question generated successfully')

            await manager.addTurn('ai', questionText, {
                type: 'question',
                questionId: firstQuestion.id,
                questionNumber: 1,
            })

            return new Response(
                JSON.stringify({
                    type: 'question',
                    content: questionText,
                    questionNumber: 1,
                    totalQuestions: state.questions.length,
                    state: manager.getState(),
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        } catch (err) {
            console.error('Error generating first question:', err)
            throw err
        }
    }

    // This is an answer to a question
    const currentQuestion = manager.getCurrentQuestion()
    if (!currentQuestion) {
        console.error('No current question found in state')
        throw new Error('No current question')
    }
    console.log('Current question:', { id: currentQuestion.id, category: currentQuestion.question_category })

    // Check if we need a follow-up
    const needsFollowUp = shouldAskFollowUp(userResponse, currentQuestion.question_category)
    console.log('Needs follow up:', needsFollowUp)

    if (needsFollowUp) {
        try {
            // Generate follow-up question with minimal prompt
            const followUpPrompt = `User answered: "${userResponse}"\n\nAsk ONE follow-up for more detail on their ${currentQuestion.question_category.replace('_', ' ')} answer.`

            console.log('Generating follow-up question')
            const followUpText = await callGeminiWithFallback(followUpPrompt, 'SIMPLE')
            console.log('Follow-up generated successfully')

            await manager.addTurn('ai', followUpText, {
                type: 'follow_up',
                questionId: currentQuestion.id,
            })

            return new Response(
                JSON.stringify({
                    type: 'follow_up',
                    content: followUpText,
                    state: manager.getState(),
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        } catch (err) {
            console.error('Error generating follow-up:', err)
            throw err
        }
    }

    // Move to next question or conclude
    const hasNext = manager.moveToNextQuestion()
    console.log('Moving to next question. Has next:', hasNext)

    if (!hasNext) {
        try {
            // Interview complete - generate conclusion
            const conclusionPrompt = generateConclusionPrompt(state.questions.length)
            console.log('Generating conclusion')
            const conclusion = await callGeminiWithFallback(conclusionPrompt, 'SIMPLE')
            console.log('Conclusion generated')

            await manager.addTurn('ai', conclusion, { type: 'conclusion' })
            await manager.saveTranscript()

            // Update session status
            await updateInterviewSession(session.id, {
                status: 'completed',
                completed_at: new Date().toISOString(),
                conversation_ended_at: new Date().toISOString(),
            }, supabase)

            return new Response(
                JSON.stringify({
                    type: 'conclusion',
                    content: conclusion,
                    completed: true,
                    state: manager.getState(),
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        } catch (err) {
            console.error('Error concluding interview:', err)
            throw err
        }
    }

    // Ask next question
    const nextQuestion = manager.getCurrentQuestion()
    if (!nextQuestion) {
        console.error('Failed to get next question despite hasNext=true')
        throw new Error('Failed to get next question')
    }

    try {
        const questionPrompt = generateQuestionPrompt(nextQuestion)
        console.log('Generating next question')
        const questionText = await callGeminiWithFallback(questionPrompt, 'SIMPLE')
        console.log('Next question generated')

        await manager.addTurn('ai', questionText, {
            type: 'question',
            questionId: nextQuestion.id,
            questionNumber: state.currentQuestionIndex + 1,
        })

        return new Response(
            JSON.stringify({
                type: 'question',
                content: questionText,
                questionNumber: state.currentQuestionIndex + 1,
                totalQuestions: state.questions.length,
                state: manager.getState(),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    } catch (err) {
        console.error('Error generating next question:', err)
        throw err
    }
}

async function handleEnd(session: InterviewSession, manager: ConversationManager, supabase: SupabaseClient) {
    // Save transcript and mark as abandoned
    await manager.saveTranscript()

    await updateInterviewSession(session.id, {
        status: 'abandoned',
        conversation_ended_at: new Date().toISOString(),
    }, supabase)

    return new Response(
        JSON.stringify({
            type: 'ended',
            message: 'Interview ended',
            state: manager.getState(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
}
