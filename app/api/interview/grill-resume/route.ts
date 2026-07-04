import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { generateResumeGrillQuestions } from '@/shared/infrastructure/ai'
import { createInterviewSession, createQuestionsForSession } from '@/modules/interviews/services/interview.service'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import type { QuestionCategory } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * POST /api/interview/grill-resume
 *
 * Generate "Resume Grill" questions based on the user's resume.
 * These questions probe deep into specific experiences and projects.
 *
 * Body:
 * - applicationId: string (required)
 * - documentId: string (required) - The resume to grill
 * - difficulty: 'easy' | 'medium' | 'hard' (required)
 * - questionCount: number (default: 5)
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
    const { applicationId, documentId, difficulty, questionCount = 5 } = body

    // Validation
    if (!applicationId || !documentId || !difficulty) {
      return NextResponse.json(
        { error: 'Missing required fields: applicationId, documentId, difficulty' },
        { status: 400 }
      )
    }

    const validDifficulties = ['easy', 'medium', 'hard']
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
    const { data: application } = await supabase
      .from('applications')
      .select('id, company')
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .single()

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    // Fetch document (resume)
    const { data: document } = await supabase
      .from('documents')
      .select('id, extracted_text, parsed_data')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (!document.extracted_text) {
      return NextResponse.json(
        { error: 'Document has no extracted text. Please reprocess the document.' },
        { status: 400 }
      )
    }

    // Generate resume-specific questions FIRST - fail early if this fails
    console.log(`Generating ${questionCount} resume grill questions...`)
    const aiQuestions = await generateResumeGrillQuestions({
      resumeText: document.extracted_text,
      parsedData: document.parsed_data,
      questionCount,
      difficulty,
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
      session_type: 'resume_grill',
      difficulty,
      company_name: application.company || null,
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
    console.error('Error generating resume grill questions:', error)
    return NextResponse.json(
      { error: 'Failed to generate resume-specific questions' },
      { status: 500 }
    )
  }
}
