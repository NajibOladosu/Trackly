import type { ParsedDocument } from "@/shared/infrastructure/ai"
import type { ResumeAnalysisResult } from "@/modules/applications/components/resume-feedback"

export type ApplicationStatus = 'draft' | 'submitted' | 'in_review' | 'interview' | 'offer' | 'rejected'
export type ApplicationPriority = 'low' | 'medium' | 'high'
export type ApplicationType = 'job' | 'scholarship' | 'internship' | 'other'
export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'deadline' | 'status_update'
export type FeedbackType = 'general' | 'bug' | 'feature'
export type FeedbackStatus = 'pending' | 'reviewed' | 'resolved'

export interface ReportCategory {
  name: string
  score: number
  strengths: string[]
  improvements: string[]
}

export interface DocumentReport {
  documentType: string
  overallScore: number
  overallAssessment: string
  categories: ReportCategory[]
}

export interface User {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  email_verified: boolean | null
  verification_token: string | null
  verification_token_expires_at: string | null
  last_verification_email_sent: string | null
  created_at: string
  updated_at: string
}

export interface Application {
  id: string
  user_id: string
  title: string
  company: string | null
  url: string | null
  status: ApplicationStatus
  priority: ApplicationPriority
  type: ApplicationType
  deadline: string | null
  job_description: string | null
  ai_cover_letter: string | null
  manual_cover_letter: string | null
  last_analyzed_document_id: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export interface Question {
  id: string
  application_id: string
  question_text: string
  ai_answer: string | null
  manual_answer: string | null
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  user_id: string
  file_name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  parsed_data: ParsedDocument | null
  version: number
  created_at: string
  updated_at: string
  report: DocumentReport | null
  report_generated_at: string | null
  analysis_status: 'not_analyzed' | 'pending' | 'success' | 'failed'
  analysis_error: string | null
  parsed_at: string | null
  application_id: string | null
  extracted_text: string | null
  analysis_result: ResumeAnalysisResult | null
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  message: string
  is_read: boolean
  created_at: string
  email_sent?: boolean
  email_sent_at?: string | null
  email_error?: string | null
}

export interface StatusHistory {
  id: string
  application_id: string
  old_status: string | null
  new_status: string
  changed_by: string | null
  timestamp: string
}

export interface Feedback {
  id: string
  user_id: string
  type: FeedbackType
  title: string
  description: string
  status: FeedbackStatus
  created_at: string
  updated_at: string
}

export interface ApplicationNote {
  id: string
  application_id: string
  user_id: string
  content: string
  category: string | null
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export interface ApplicationContact {
  id: string
  application_id: string
  user_id: string
  name: string
  role: string | null
  email: string | null
  linkedin_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Interview feature types
export type SessionType = 'behavioral' | 'technical' | 'company_specific' | 'mixed' | 'resume_grill'
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned'
export type InterviewDifficulty = 'easy' | 'medium' | 'hard'
export type AnswerType = 'voice' | 'text'

export type QuestionCategory =
  | 'behavioral_leadership'
  | 'behavioral_teamwork'
  | 'behavioral_conflict'
  | 'behavioral_failure'
  | 'technical_coding'
  | 'technical_system_design'
  | 'technical_algorithms'
  | 'company_culture'
  | 'company_values'
  | 'resume_specific'
  | 'other'


export interface IdealAnswerOutline {
  structure: string
  keyPoints: string[]
  exampleMetrics?: string[]
  commonPitfalls?: string[]
}

export interface EvaluationCriteria {
  mustInclude?: string[]
  bonusPoints?: string[]
  redFlags?: string[]
}

export interface InterviewFeedback {
  overall: string
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  tone_analysis?: string  // Analysis of communication style and delivery
  rubric?: Record<string, number>  // Optional per-dimension rubric scores
}

export interface ScoreBreakdown {
  clarity: number
  structure: number
  relevance: number
  depth: number
  confidence: number
}

export interface InterviewSession {
  id: string
  application_id: string
  user_id: string
  session_type: SessionType
  company_name: string | null
  difficulty: InterviewDifficulty | null
  status: SessionStatus
  started_at: string
  completed_at: string | null
  total_questions: number
  answered_questions: number
  average_score: number | null
  total_duration_seconds: number | null
  conversation_mode: boolean
  full_transcript: ConversationTurn[] | null
  conversation_started_at: string | null
  conversation_ended_at: string | null
  created_at: string
  updated_at: string
}

export interface InterviewQuestion {
  id: string
  session_id: string
  user_id: string
  question_text: string
  question_category: QuestionCategory
  difficulty: InterviewDifficulty | null
  ideal_answer_outline: IdealAnswerOutline | null
  evaluation_criteria: EvaluationCriteria | null
  question_order: number
  estimated_duration_seconds: number
  created_at: string
}

export interface InterviewAnswer {
  id: string
  question_id: string
  session_id: string
  user_id: string
  answer_text: string
  answer_type: AnswerType
  audio_url: string | null
  audio_duration_seconds: number | null
  transcription_confidence: number | null
  score: number
  feedback: InterviewFeedback
  clarity_score: number | null
  structure_score: number | null
  relevance_score: number | null
  depth_score: number | null
  confidence_score: number | null
  time_taken_seconds: number | null
  answered_at: string
  created_at: string
}

export interface InterviewAnalytics {
  id: string
  user_id: string
  application_id: string | null
  period_start: string
  period_end: string
  total_sessions: number
  total_questions: number
  total_answers: number
  average_score: number | null
  average_clarity_score: number | null
  average_structure_score: number | null
  average_relevance_score: number | null
  average_depth_score: number | null
  average_confidence_score: number | null
  scores_by_category: Record<string, number> | null
  top_strengths: string[] | null
  common_weaknesses: string[] | null
  score_trend: Array<{ date: string; score: number }> | null
  created_at: string
  updated_at: string
}

export interface TemplateQuestion {
  text: string
  category: QuestionCategory
  difficulty: InterviewDifficulty
  idealOutline: IdealAnswerOutline
  evaluationCriteria: EvaluationCriteria
  estimatedDurationSeconds: number
  tags?: string[]
}

export interface CompanyTemplate {
  id: string
  company_name: string
  company_slug: string
  job_role: string | null
  interview_round: string | null
  questions: TemplateQuestion[]
  description: string | null
  tips: string[] | null
  times_used: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export interface ConversationTurn {
  id: string
  session_id: string
  user_id: string
  turn_number: number
  speaker: 'ai' | 'user'
  content: string
  audio_url: string | null
  audio_duration_seconds: number | null
  timestamp: string
  metadata: ConversationTurnMetadata | null
  created_at: string
}

export interface ConversationTurnMetadata {
  type?: string
  questionNumber?: number
  [key: string]: unknown
}
