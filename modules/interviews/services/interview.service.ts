import { createClient } from '@/shared/db/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  InterviewSession,
  InterviewQuestion,
  InterviewAnswer,
  CompanyTemplate,
  SessionType,
  InterviewDifficulty,
  AnswerType,
  QuestionCategory,
  IdealAnswerOutline,
  EvaluationCriteria,
  InterviewFeedback,
} from '@/types/database'

// Re-export conversation functions
export { getConversationTurns } from './conversation.service'


// ============================================================================
// INTERVIEW SESSIONS
// ============================================================================

export async function getInterviewSessions(applicationId: string): Promise<InterviewSession[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('interview_sessions')
    .select(`
      *,
      db_total_questions,
      db_answered_questions,
      db_average_score
    `)
    .eq('application_id', applicationId)
    .order('started_at', { ascending: false })

  if (error) throw error

  return (data || []).map((session: InterviewSession & {
    db_total_questions?: number | null
    db_answered_questions?: number | null
    db_average_score?: number | null
  }) => ({
    ...session,
    total_questions: session.db_total_questions ?? session.total_questions,
    answered_questions: session.db_answered_questions ?? session.answered_questions,
    average_score: session.db_average_score ?? session.average_score,
  })) as InterviewSession[]
}

export async function getInterviewSession(
  sessionId: string,
  supabaseClient?: SupabaseClient
): Promise<InterviewSession> {
  const supabase = supabaseClient || createClient()
  const { data, error } = await supabase
    .from('interview_sessions')
    .select(`
      *,
      db_total_questions,
      db_answered_questions,
      db_average_score
    `)
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(`Interview session not found or access denied: ${sessionId}`)

  const session = data as InterviewSession & {
    db_total_questions?: number | null
    db_answered_questions?: number | null
    db_average_score?: number | null
  }
  return {
    ...session,
    total_questions: session.db_total_questions ?? session.total_questions,
    answered_questions: session.db_answered_questions ?? session.answered_questions,
    average_score: session.db_average_score ?? session.average_score,
  } as InterviewSession
}

export async function createInterviewSession(
  session: {
    application_id: string
    session_type: SessionType
    company_name?: string
    difficulty?: InterviewDifficulty
  },
  supabaseClient?: SupabaseClient
): Promise<InterviewSession> {
  const supabase = supabaseClient || createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('interview_sessions')
    .insert([
      {
        user_id: user.id,
        ...session,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data as InterviewSession
}

export async function updateInterviewSession(
  sessionId: string,
  updates: Partial<InterviewSession>,
  supabaseClient?: SupabaseClient
): Promise<InterviewSession> {
  const supabase = supabaseClient || createClient()
  const { data, error } = await supabase
    .from('interview_sessions')
    .update(updates)
    .eq('id', sessionId)
    .select()
    .single()

  if (error) throw error
  return data as InterviewSession
}

export async function deleteInterviewSession(sessionId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('interview_sessions')
    .delete()
    .eq('id', sessionId)

  if (error) throw error
}

export async function completeInterviewSession(sessionId: string): Promise<InterviewSession> {
  const supabase = createClient()

  // Get all answers for this session to calculate statistics
  const { data: answers, error: answersError } = await supabase
    .from('interview_answers')
    .select('score, time_taken_seconds')
    .eq('session_id', sessionId)

  if (answersError) throw answersError

  const totalAnswers = answers?.length || 0
  const averageScore = totalAnswers > 0
    ? answers.reduce((sum, a) => sum + a.score, 0) / totalAnswers
    : null
  const totalDuration = totalAnswers > 0
    ? answers.reduce((sum, a) => sum + (a.time_taken_seconds || 0), 0)
    : null

  return updateInterviewSession(sessionId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    answered_questions: totalAnswers,
    average_score: averageScore,
    total_duration_seconds: totalDuration,
  })
}

export async function resetInterviewSession(
  sessionId: string,
  supabaseClient?: SupabaseClient
): Promise<InterviewSession> {
  const supabase = supabaseClient || createClient()

  // 1. Delete all answers for this session
  const { error: deleteError } = await supabase
    .from('interview_answers')
    .delete()
    .eq('session_id', sessionId)

  if (deleteError) throw deleteError

  // 2. Reset session status and metrics
  // We set conversation_mode to false so the user can choose again
  return updateInterviewSession(
    sessionId,
    {
      status: 'in_progress', // Reset to in_progress
      completed_at: null,
      answered_questions: 0,
      average_score: null,
      total_duration_seconds: 0,
      conversation_mode: false,
      conversation_started_at: null,
    },
    supabase
  )
}

// ============================================================================
// INTERVIEW QUESTIONS
// ============================================================================

export async function getQuestionsForSession(
  sessionId: string,
  supabaseClient?: SupabaseClient
): Promise<InterviewQuestion[]> {
  const supabase = supabaseClient || createClient()
  const { data, error } = await supabase
    .from('interview_questions')
    .select('*')
    .eq('session_id', sessionId)
    .order('question_order', { ascending: true })

  if (error) throw error
  return data as InterviewQuestion[]
}

export async function getInterviewQuestion(
  questionId: string,
  supabaseClient?: SupabaseClient
): Promise<InterviewQuestion> {
  const supabase = supabaseClient || createClient()
  const { data, error } = await supabase
    .from('interview_questions')
    .select('*')
    .eq('id', questionId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(`Interview question not found or access denied: ${questionId}`)
  return data as InterviewQuestion
}

export async function createQuestion(
  question: {
    session_id: string
    question_text: string
    question_category: QuestionCategory
    difficulty?: InterviewDifficulty
    ideal_answer_outline?: IdealAnswerOutline
    evaluation_criteria?: EvaluationCriteria
    question_order: number
    estimated_duration_seconds?: number
  },
  supabaseClient?: SupabaseClient
): Promise<InterviewQuestion> {
  const supabase = supabaseClient || createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('interview_questions')
    .insert([
      {
        user_id: user.id,
        ...question,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data as InterviewQuestion
}

export async function createQuestionsForSession(
  sessionId: string,
  questions: Array<{
    question_text: string
    question_category: QuestionCategory
    difficulty?: InterviewDifficulty
    ideal_answer_outline?: IdealAnswerOutline
    evaluation_criteria?: EvaluationCriteria
    question_order: number
    estimated_duration_seconds?: number
  }>,
  supabaseClient?: SupabaseClient
): Promise<InterviewQuestion[]> {
  const supabase = supabaseClient || createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const questionsWithSessionAndUser = questions.map(q => ({
    ...q,
    session_id: sessionId,
    user_id: user.id,
  }))

  const { data, error } = await supabase
    .from('interview_questions')
    .insert(questionsWithSessionAndUser)
    .select()

  if (error) throw error

  // Update session with total_questions count
  await updateInterviewSession(sessionId, {
    total_questions: questions.length,
  }, supabase)

  return data as InterviewQuestion[]
}

export async function updateQuestion(
  questionId: string,
  updates: Partial<InterviewQuestion>
): Promise<InterviewQuestion> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('interview_questions')
    .update(updates)
    .eq('id', questionId)
    .select()
    .single()

  if (error) throw error
  return data as InterviewQuestion
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('interview_questions')
    .delete()
    .eq('id', questionId)

  if (error) throw error
}

// ============================================================================
// INTERVIEW ANSWERS
// ============================================================================

export async function getAnswersForSession(
  sessionId: string,
  supabaseClient?: SupabaseClient
): Promise<InterviewAnswer[]> {
  const supabase = supabaseClient || createClient()
  const { data, error } = await supabase
    .from('interview_answers')
    .select('*')
    .eq('session_id', sessionId)
    .order('answered_at', { ascending: true })

  if (error) throw error
  return data as InterviewAnswer[]
}

export async function getAnswerForQuestion(questionId: string): Promise<InterviewAnswer | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('interview_answers')
    .select('*')
    .eq('question_id', questionId)
    .maybeSingle()

  if (error) throw error
  return data as InterviewAnswer | null
}

export async function createAnswer(
  answer: {
    question_id: string
    session_id: string
    answer_text: string
    answer_type: AnswerType
    audio_url?: string
    audio_duration_seconds?: number
    transcription_confidence?: number
    score: number
    feedback: InterviewFeedback
    clarity_score?: number
    structure_score?: number
    relevance_score?: number
    depth_score?: number
    confidence_score?: number
    time_taken_seconds?: number
  },
  supabaseClient?: SupabaseClient
): Promise<InterviewAnswer> {
  const supabase = supabaseClient || createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('interview_answers')
    .insert([
      {
        user_id: user.id,
        ...answer,
      },
    ])
    .select()

  if (error) {
    console.error('Error inserting answer:', error)
    throw error
  }

  if (!data || data.length === 0) {
    throw new Error('Failed to create answer: No data returned')
  }

  const insertedAnswer = Array.isArray(data) ? data[0] : data

  // Update session statistics
  try {
    const session = await getInterviewSession(answer.session_id, supabase)

    const answeredCount = session.answered_questions + 1

    // Recalculate average score
    const allAnswers = await getAnswersForSession(answer.session_id, supabase)
    const newAverage = allAnswers.reduce((sum, a) => sum + a.score, 0) / allAnswers.length

    await updateInterviewSession(answer.session_id, {
      answered_questions: answeredCount,
      average_score: newAverage,
    }, supabase)
  } catch (err) {
    // Don't fail the request if stats update fails, but log it
    // actually, if we want to debug, let's rethrow or let it bubble up
    throw err
  }

  return insertedAnswer as InterviewAnswer
}

export async function updateAnswer(
  answerId: string,
  updates: Partial<InterviewAnswer>
): Promise<InterviewAnswer> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('interview_answers')
    .update(updates)
    .eq('id', answerId)
    .select()
    .single()

  if (error) throw error
  return data as InterviewAnswer
}

export async function deleteAnswer(answerId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('interview_answers')
    .delete()
    .eq('id', answerId)

  if (error) throw error
}

// ============================================================================
// COMPANY TEMPLATES
// ============================================================================

export async function getCompanyTemplates(): Promise<CompanyTemplate[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('company_interview_templates')
    .select('*')
    .order('company_name', { ascending: true })

  if (error) throw error
  return data as CompanyTemplate[]
}

export async function getCompanyTemplate(
  companySlug: string,
  jobRole?: string
): Promise<CompanyTemplate | null> {
  const supabase = createClient()

  let query = supabase
    .from('company_interview_templates')
    .select('*')
    .eq('company_slug', companySlug)

  if (jobRole) {
    query = query.eq('job_role', jobRole)
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw error
  return data as CompanyTemplate | null
}

export async function incrementTemplateUsage(templateId: string): Promise<void> {
  const supabase = createClient()

  // Get current times_used
  const { data: template, error: fetchError } = await supabase
    .from('company_interview_templates')
    .select('times_used')
    .eq('id', templateId)
    .single()

  if (fetchError) throw fetchError

  // Increment and update
  const { error } = await supabase
    .from('company_interview_templates')
    .update({
      times_used: (template.times_used || 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', templateId)

  if (error) throw error
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export async function getSessionWithQuestions(sessionId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('interview_sessions')
    .select(`
      *,
      interview_questions (*)
    `)
    .eq('id', sessionId)
    .single()

  if (error) throw error
  return data
}

export async function getSessionWithQuestionsAndAnswers(sessionId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('interview_sessions')
    .select(`
      *,
      interview_questions (
        *,
        interview_answers (*)
      )
    `)
    .eq('id', sessionId)
    .single()

  if (error) throw error
  return data
}

export async function getApplicationSessions(applicationId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('interview_sessions')
    .select(`
      *,
      interview_questions (count)
    `)
    .eq('application_id', applicationId)
    .order('started_at', { ascending: false })

  if (error) throw error
  return data
}
