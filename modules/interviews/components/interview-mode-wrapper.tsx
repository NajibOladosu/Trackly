'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Badge } from '@/shared/ui/badge'
import { MessageSquare, Mic, ArrowLeft } from 'lucide-react'
import { InterviewSessionDetail } from './interview-session-detail'
import dynamic from 'next/dynamic'

const LiveInterview = dynamic(() => import('./live-interview-v2').then(mod => mod.LiveInterview), {
    loading: () => <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>,
    ssr: false
})
import { getInterviewSession, getConversationTurns } from '@/modules/interviews/services/interview.service'
import type { InterviewSession, ConversationTurn } from '@/types/database'

interface InterviewModeWrapperProps {
    sessionId: string
    onComplete?: () => void
    onBack?: () => void
}

export function InterviewModeWrapper({ sessionId, onComplete, onBack }: InterviewModeWrapperProps) {
    const [session, setSession] = useState<InterviewSession | null>(null)
    const [mode, setMode] = useState<'select' | 'text' | 'conversation' | 'review'>('select')
    const [_transcript, setTranscript] = useState<ConversationTurn[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadSession = async () => {
            try {
                const sessionData = await getInterviewSession(sessionId)
                setSession(sessionData)

                // If session is already in conversation mode or completed, load transcript
                if (sessionData.conversation_mode) {
                    if (sessionData.status === 'completed' && sessionData.full_transcript) {
                        setTranscript(sessionData.full_transcript)
                        setMode('review')
                    } else if (sessionData.status === 'in_progress') {
                        // Resume conversation
                        const turns = await getConversationTurns(sessionId)
                        setTranscript(turns)
                        setMode('conversation')
                    }
                } else {
                    // Text mode or new session
                    // If completed OR partially answered, default to text mode
                    if (sessionData.status === 'completed' || sessionData.answered_questions > 0) {
                        setMode('text')
                    }
                    // Otherwise keep 'select' mode (new session)
                }
            } catch (err) {
                console.error('Error loading session:', err)
            } finally {
                setLoading(false)
            }
        }

        loadSession()
    }, [sessionId])

    if (loading || !session) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        )
    }

    // Mode selection screen
    if (mode === 'select' && session.status === 'in_progress') {
        return (
            <div className="flex items-center justify-center p-6">
                <div className="max-w-5xl w-full space-y-8">
                    {/* Header */}
                    <div className="text-center space-y-3">
                        {onBack && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onBack}
                                className="absolute top-6 left-6 text-muted-foreground hover:text-foreground"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                        )}
                        <h1 className="text-4xl font-bold tracking-tight">
                            Choose Your Interview Mode
                        </h1>
                        <p className="text-muted-foreground text-lg">
                            Select the format that works best for you
                        </p>
                    </div>

                    {/* Mode Cards */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Conversational Mode */}
                        <div
                            onClick={() => setMode('conversation')}
                            className="group relative cursor-pointer"
                        >
                            <div className="absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none shadow-[0_0_20px_4px_rgba(0,255,136,0.28)]" />
                            <Card className="relative h-full bg-card border-border hover:border-primary/60 transition-all duration-300">
                                <div className="p-8 space-y-6">
                                    {/* Icon & Badge */}
                                    <div className="flex items-start justify-between">
                                        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                                            <Mic className="w-8 h-8 text-primary" />
                                        </div>
                                        <Badge className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/30">
                                            Recommended
                                        </Badge>
                                    </div>

                                    {/* Title & Description */}
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-bold">Conversational Mode</h3>
                                        <p className="text-muted-foreground leading-relaxed">
                                            Real-time voice conversation with an AI interviewer.
                                            Experience natural dialogue with dynamic follow-ups.
                                        </p>
                                    </div>

                                    {/* Features */}
                                    <div className="space-y-3 pt-4 border-t border-border/50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                            <span className="text-sm">Voice-based interaction</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                            <span className="text-sm">Automatic speech detection</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                            <span className="text-sm">Dynamic follow-up questions</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                            <span className="text-sm">Realistic interview experience</span>
                                        </div>
                                    </div>

                                    {/* CTA */}
                                    <div className="pt-4">
                                        <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                                            <span>Start voice interview</span>
                                            <ArrowLeft className="w-4 h-4 rotate-180 transform group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Text Mode */}
                        <div
                            onClick={() => setMode('text')}
                            className="group relative cursor-pointer"
                        >
                            <div className="absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none shadow-[0_0_20px_4px_rgba(255,255,255,0.28)]" />
                            <Card className="relative h-full bg-card border-border hover:border-muted-foreground/50 transition-all duration-300">
                                <div className="p-8 space-y-6">
                                    {/* Icon & Badge */}
                                    <div className="flex items-start justify-between">
                                        <div className="p-4 rounded-xl bg-muted border border-border">
                                            <MessageSquare className="w-8 h-8 text-muted-foreground" />
                                        </div>
                                        <Badge variant="secondary" className="border-border">
                                            Classic
                                        </Badge>
                                    </div>

                                    {/* Title & Description */}
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-bold">Text Mode</h3>
                                        <p className="text-muted-foreground leading-relaxed">
                                            Traditional text-based Q&A format.
                                            Type your responses and receive detailed AI feedback.
                                        </p>
                                    </div>

                                    {/* Features */}
                                    <div className="space-y-3 pt-4 border-t border-border/50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                                            <span className="text-sm">Type your responses</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                                            <span className="text-sm">Take your time to think</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                                            <span className="text-sm">Edit before submitting</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                                            <span className="text-sm">Detailed written feedback</span>
                                        </div>
                                    </div>

                                    {/* CTA */}
                                    <div className="pt-4">
                                        <div className="flex items-center text-muted-foreground font-medium group-hover:gap-2 transition-all group-hover:text-foreground">
                                            <span>Start text interview</span>
                                            <ArrowLeft className="w-4 h-4 rotate-180 transform group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Render appropriate mode
    if (mode === 'conversation') {
        return (
            <LiveInterview
                sessionId={sessionId}
                onComplete={(newTranscript) => {
                    setTranscript(newTranscript)
                    setMode('review')
                    onComplete?.()
                }}
                onError={(error) => {
                    console.error('Interview error:', error)
                }}
            />
        )
    }

    if (mode === 'review') {
        // For completed conversational interviews, we want to show the full report details
        // The InterviewSessionDetail component handles the "completed" state by showing the summary/score card
        return (
            <InterviewSessionDetail
                sessionId={sessionId}
                onComplete={onComplete}
                onBack={onBack}
            />
        )
    }

    // Default to text mode
    return (
        <InterviewSessionDetail
            sessionId={sessionId}
            onComplete={onComplete}
            onBack={onBack}
        />
    )
}
