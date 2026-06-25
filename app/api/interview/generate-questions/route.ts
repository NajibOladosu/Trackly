import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { generateInterviewQuestions } from '@/shared/infrastructure/ai'
import { createInterviewSession, createQuestionsForSession } from '@/modules/interviews/services/interview.service'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import type { QuestionCategory } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * POST /api/interview/generate-questions
 *
 * Generate interview questions for a new session.
 * Creates a session and generates questions using AI.
 *
 * Body:
 * - applicationId: string (required)
 * - sessionType: 'behavioral' | 'technical' | 'mixed' (required)
 * - difficulty: 'easy' | 'medium' | 'hard' (required)
 * - questionCount: number (default: 5)
 * - companyName?: string (optional)
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
    const { applicationId, sessionType, difficulty, questionCount = 5, companyName } = body

    // Validation
    if (!applicationId || !sessionType || !difficulty) {
      return NextResponse.json(
        { error: 'Missing required fields: applicationId, sessionType, difficulty' },
        { status: 400 }
      )
    }

    const validSessionTypes = ['behavioral', 'technical', 'mixed']
    const validDifficulties = ['easy', 'medium', 'hard']

    if (!validSessionTypes.includes(sessionType)) {
      return NextResponse.json({ error: 'Invalid sessionType' }, { status: 400 })
    }

    if (!validDifficulties.includes(difficulty)) {
      return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 })
    }

    if (questionCount < 1 || questionCount > 20) {
      return NextResponse.json(
        { error: 'questionCount must be between 1 and 20' },
        { status: 400 }
      )
    }

    // Verify application belongs to user

    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, company, job_description')
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .single()

    if (appError) {

      return NextResponse.json({ error: `Database error: ${appError.message}` }, { status: 500 })
    }

    if (!application) {

      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }



    // Generate questions FIRST - fail early if this fails
    console.log(`Generating ${questionCount} questions for ${sessionType} interview...`)
    const aiQuestions = await generateInterviewQuestions({
      sessionType,
      difficulty,
      questionCount,
      jobDescription: application.job_description || undefined,
      companyName: companyName || application.company || undefined,
    })

    if (!aiQuestions || aiQuestions.length === 0) {
      console.error('Question generation failed - no questions returned')
      return NextResponse.json(
        { error: 'Failed to generate interview questions. Please try again.' },
        { status: 500 }
      )
    }

    console.log(`Successfully generated ${aiQuestions.length} questions`)

    // Only create session if questions were generated successfully
    const session = await createInterviewSession({
      application_id: applicationId,
      session_type: sessionType,
      difficulty,
      company_name: companyName || application.company || null,
    }, supabase)

    console.log(`Created interview session: ${session.id}`)

    // Save questions to database
    const questions = await createQuestionsForSession(
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

    console.log(`Saved ${questions.length} questions to database`)

    return NextResponse.json(
      {
        session,
        questions,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error generating interview questions:', error)
    return NextResponse.json(
      { error: 'Failed to generate interview questions' },
      { status: 500 }
    )
  }
}
