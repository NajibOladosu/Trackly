import { createClient } from '@/shared/db/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConversationTurn, ConversationTurnMetadata, InterviewQuestion } from '@/types/database'

// ============================================================================
// CONVERSATION TURNS
// ============================================================================

export async function getConversationTurns(sessionId: string): Promise<ConversationTurn[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('conversation_turns')
        .select('*')
        .eq('session_id', sessionId)
        .order('turn_number', { ascending: true })

    if (error) throw error
    return data as ConversationTurn[]
}

export async function createConversationTurn(
    turn: {
        session_id: string
        turn_number: number
        speaker: 'ai' | 'user'
        content: string
        audio_url?: string
        audio_duration_seconds?: number
        metadata?: ConversationTurnMetadata
    },
    supabaseClient?: SupabaseClient
): Promise<ConversationTurn> {
    const supabase = supabaseClient || createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
        .from('conversation_turns')
        .insert([
            {
                user_id: user.id,
                ...turn,
            },
        ])
        .select()
        .single()

    if (error) throw error
    return data as ConversationTurn
}

export async function saveFullTranscript(
    sessionId: string,
    transcript: ConversationTurn[],
    supabaseClient?: SupabaseClient
): Promise<void> {
    const supabase = supabaseClient || createClient()
    const { error } = await supabase
        .from('interview_sessions')
        .update({
            full_transcript: transcript,
            conversation_ended_at: new Date().toISOString(),
        })
        .eq('id', sessionId)

    if (error) throw error
}

// ============================================================================
// CONVERSATION STATE MANAGEMENT
// ============================================================================

export interface ConversationState {
    sessionId: string
    currentQuestionIndex: number
    questions: InterviewQuestion[]
    turns: ConversationTurn[]
    isIntroductionComplete: boolean
    isInterviewComplete: boolean
    awaitingUserResponse: boolean
}

export class ConversationManager {
    private state: ConversationState
    private supabase: SupabaseClient

    constructor(sessionId: string, questions: InterviewQuestion[], supabase: SupabaseClient) {
        this.state = {
            sessionId,
            currentQuestionIndex: -1, // Start at -1 for introduction
            questions,
            turns: [],
            isIntroductionComplete: false,
            isInterviewComplete: false,
            awaitingUserResponse: false,
        }
        this.supabase = supabase
    }

    async loadState(): Promise<void> {
        // Load existing turns
        const turns = await getConversationTurns(this.state.sessionId)
        this.state.turns = turns

        // Reconstruct state from turns
        if (turns.length > 0) {
            // Check for introduction
            const hasIntro = turns.some(t => t.metadata?.type === 'introduction')

            // Count questions asked
            const questionsAsked = turns.filter(t => t.metadata?.type === 'question')
            const lastQuestion = questionsAsked[questionsAsked.length - 1]

            if (lastQuestion) {
                this.state.isIntroductionComplete = true
                // questionNumber is 1-based, index is 0-based
                this.state.currentQuestionIndex = (lastQuestion.metadata?.questionNumber || 1) - 1
            } else if (hasIntro) {
                // Intro done, but no questions asked yet (waiting for user ready response)
                this.state.isIntroductionComplete = false
                this.state.currentQuestionIndex = -1
            }

            // Check for conclusion
            const hasConclusion = turns.some(t => t.metadata?.type === 'conclusion')
            if (hasConclusion) {
                this.state.isInterviewComplete = true
            }
        }
    }

    async addTurn(speaker: 'ai' | 'user', content: string, metadata?: ConversationTurnMetadata): Promise<ConversationTurn> {
        const turnNumber = this.state.turns.length + 1

        const turn = await createConversationTurn(
            {
                session_id: this.state.sessionId,
                turn_number: turnNumber,
                speaker,
                content,
                metadata,
            },
            this.supabase
        )

        this.state.turns.push(turn)
        return turn
    }

    getState(): ConversationState {
        return { ...this.state }
    }

    getCurrentQuestion(): InterviewQuestion | null {
        if (this.state.currentQuestionIndex < 0 || this.state.currentQuestionIndex >= this.state.questions.length) {
            return null
        }
        return this.state.questions[this.state.currentQuestionIndex]
    }

    moveToNextQuestion(): boolean {
        if (this.state.currentQuestionIndex < this.state.questions.length - 1) {
            this.state.currentQuestionIndex++
            return true
        }
        this.state.isInterviewComplete = true
        return false
    }

    markIntroductionComplete(): void {
        this.state.isIntroductionComplete = true
        this.state.currentQuestionIndex = 0
    }

    setAwaitingUserResponse(awaiting: boolean): void {
        this.state.awaitingUserResponse = awaiting
    }

    async saveTranscript(): Promise<void> {
        await saveFullTranscript(this.state.sessionId, this.state.turns, this.supabase)
    }
}

// ============================================================================
// CONVERSATION PROMPTS (OPTIMIZED FOR SPEED)
// ============================================================================

export function generateIntroductionPrompt(
    companyName: string | null,
    sessionType: string,
    difficulty: string
): string {
    const company = companyName || 'this position'
    return `You're an AI interviewer for a ${sessionType} interview (${difficulty} level) for ${company}. Greet the candidate warmly in 1-2 sentences and ask if they're ready.`
}

export function generateQuestionPrompt(
    question: InterviewQuestion,
    isFollowUp: boolean = false
): string {
    if (isFollowUp) {
        return `Ask ONE follow-up question to get more detail. Be brief and conversational.`
    }

    return `Ask this question conversationally: "${question.question_text}"`
}

export function generateConclusionPrompt(totalQuestions: number): string {
    return `Thank the candidate for completing ${totalQuestions} questions. Tell them they'll get feedback soon. Keep it to 1-2 sentences.`
}

export function shouldAskFollowUp(userResponse: string, questionCategory: string): boolean {
    // Simple heuristic: if response is very short, might need follow-up
    const wordCount = userResponse.trim().split(/\s+/).length

    // Behavioral questions should have more detail (STAR method)
    if (questionCategory.startsWith('behavioral_') && wordCount < 50) {
        return true
    }

    // Technical questions should show understanding
    if (questionCategory.startsWith('technical_') && wordCount < 30) {
        return true
    }

    // Resume-specific should have specific details
    if (questionCategory === 'resume_specific' && wordCount < 40) {
        return true
    }

    return false
}
