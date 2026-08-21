'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AIOrb, type OrbMode } from './ai-orb'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Mic, MicOff, Square } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConversationTurn {
    speaker: 'ai' | 'user'
    content: string
    timestamp: string
}

// Minimal Web Speech API types (not in the standard TS DOM lib)
interface SpeechRecognitionAlternative {
    transcript: string
}
interface SpeechRecognitionResult {
    0: SpeechRecognitionAlternative
}
interface SpeechRecognitionEvent {
    results: ArrayLike<SpeechRecognitionResult>
}
interface SpeechRecognitionErrorEvent {
    error: string
}
interface SpeechRecognitionInstance {
    continuous: boolean
    interimResults: boolean
    lang: string
    onstart: (() => void) | null
    onend: (() => void) | null
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
    start: () => void
    stop: () => void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

interface ConversationalInterviewProps {
    sessionId: string
    onComplete: () => void
}

export function ConversationalInterview({ sessionId, onComplete }: ConversationalInterviewProps) {
    const [orbState, setOrbState] = useState<OrbMode>('idle')
    const [isRecording, setIsRecording] = useState(false)
    const [transcript, setTranscript] = useState<ConversationTurn[]>([])
    const [currentAIMessage, setCurrentAIMessage] = useState<string>('')
    const [isInterviewStarted, setIsInterviewStarted] = useState(false)
    const [isInterviewComplete, setIsInterviewComplete] = useState(false)
    const [questionNumber, setQuestionNumber] = useState(0)
    const [totalQuestions, setTotalQuestions] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const transcriptRef = useRef<HTMLDivElement>(null)
    const synthRef = useRef<SpeechSynthesisUtterance | null>(null)
    const interimTranscriptRef = useRef('')

    const isRecordingRef = useRef(false)

    // Initialize speech recognition
    useEffect(() => {
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = (window as unknown as {
                webkitSpeechRecognition: SpeechRecognitionConstructor
            }).webkitSpeechRecognition
            const recognition = new SpeechRecognition()
            recognition.continuous = true
            recognition.interimResults = true
            recognition.lang = 'en-US'

            recognition.onstart = () => {
                setIsRecording(true)
                isRecordingRef.current = true
            }

            recognition.onend = () => {
                // Only update state if we didn't manually stop it (e.g. silence or error)
                // If we are still "recording" logically, we might want to restart it? 
                // For now, let's just sync the state.
                if (isRecordingRef.current) {
                    // If it stopped unexpectedly, we might want to handle that.
                    // But for VAD, we usually stop it manually in stopRecording.
                    setIsRecording(false)
                    isRecordingRef.current = false
                }
            }

            recognition.onresult = (event: SpeechRecognitionEvent) => {
                const transcript = Array.from(event.results)
                    .map((result: SpeechRecognitionResult) => result[0])
                    .map((result) => result.transcript)
                    .join('')

                interimTranscriptRef.current = transcript


                // Reset silence timer on speech
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current)
                }

                // Set new silence timer (2 seconds of silence = end of speech)
                silenceTimerRef.current = setTimeout(() => {

                    if (isRecordingRef.current) {
                        stopRecording(transcript)
                    }
                }, 2000)
            }

            recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                console.error('Speech recognition error:', event.error)
                if (event.error !== 'no-speech') {
                    setError('Speech recognition error. Please try again.')
                    setIsRecording(false)
                    isRecordingRef.current = false
                    setOrbState('idle')
                }
            }

            recognitionRef.current = recognition
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop()
            }
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current)
            }
        }
    }, []) // Empty dependency array to run once

    // Auto-scroll transcript
    useEffect(() => {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
        }
    }, [transcript, currentAIMessage])

    const speak = useCallback((text: string) => {
        return new Promise<void>((resolve) => {
            if ('speechSynthesis' in window) {
                // Cancel any ongoing speech
                window.speechSynthesis.cancel()

                const utterance = new SpeechSynthesisUtterance(text)
                utterance.rate = 0.9
                utterance.pitch = 1
                utterance.volume = 1

                utterance.onstart = () => {
                    setOrbState('ai')
                }

                utterance.onend = () => {
                    setOrbState('idle')
                    resolve()
                }

                utterance.onerror = () => {
                    setOrbState('idle')
                    resolve()
                }

                synthRef.current = utterance
                window.speechSynthesis.speak(utterance)
            } else {
                resolve()
            }
        })
    }, [])

    const startInterview = async () => {
        try {
            setOrbState('ai')
            setError(null)

            const response = await fetch('/api/interview/conversation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    action: 'start',
                }),
            })

            if (!response.ok) {
                throw new Error('Failed to start interview')
            }

            const data = await response.json()

            setCurrentAIMessage(data.content)
            setTranscript([{ speaker: 'ai', content: data.content, timestamp: new Date().toISOString() }])
            setIsInterviewStarted(true)

            // Speak the introduction
            await speak(data.content)

            // Automatically start listening for user's ready response
            startRecording()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start interview')
            setOrbState('idle')
        }
    }

    const startRecording = () => {
        if (!recognitionRef.current) {
            setError('Speech recognition not supported in this browser')
            return
        }

        try {
            // Only start if not already started
            // Note: SpeechRecognition throws if you call start() while it's already started
            // We can check isRecordingRef, but it might be safer to wrap in try/catch
            if (!isRecordingRef.current) {
                recognitionRef.current.start()
                // State updates will happen in onstart
            }
            setError(null)
        } catch (err) {
            console.error('Failed to start recording:', err)
            // If it's already started, we're good
            if (!(err instanceof Error) || err.name !== 'InvalidStateError') {
                setError('Failed to start recording')
            }
        }
    }

    const stopRecording = async (userTranscript: string) => {
        if (recognitionRef.current) {
            recognitionRef.current.stop()
        }
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
        }

        setIsRecording(false)
        isRecordingRef.current = false
        setOrbState('ai')
        interimTranscriptRef.current = ''

        // Add user turn to transcript
        const userTurn: ConversationTurn = {
            speaker: 'user',
            content: userTranscript,
            timestamp: new Date().toISOString(),
        }
        setTranscript(prev => [...prev, userTurn])

        try {
            // Send response to backend
            const response = await fetch('/api/interview/conversation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    action: 'respond',
                    userResponse: userTranscript,
                }),
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || 'Failed to process response')
            }

            const data = await response.json()

            // Add AI turn to transcript
            const aiTurn: ConversationTurn = {
                speaker: 'ai',
                content: data.content,
                timestamp: new Date().toISOString(),
            }
            setTranscript(prev => [...prev, aiTurn])
            setCurrentAIMessage(data.content)

            if (data.questionNumber) {
                setQuestionNumber(data.questionNumber)
                setTotalQuestions(data.totalQuestions)
            }

            // Speak AI response
            await speak(data.content)

            // Check if interview is complete
            if (data.completed || data.type === 'conclusion') {
                setIsInterviewComplete(true)
                setOrbState('idle')
            } else {
                // Continue listening for next response
                startRecording()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to process response')
            setOrbState('idle')
        }
    }

    const endInterview = async () => {
        try {
            if (recognitionRef.current) {
                recognitionRef.current.stop()
            }
            window.speechSynthesis.cancel()

            await fetch('/api/interview/conversation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    action: 'end',
                }),
            })

            onComplete()
        } catch (err) {
            console.error('Failed to end interview:', err)
            onComplete()
        }
    }

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">AI Interview</h2>
                    {totalQuestions > 0 && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Question {questionNumber} of {totalQuestions}
                        </p>
                    )}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={endInterview}
                    className="text-red-600 hover:text-red-700"
                >
                    <Square className="w-4 h-4 mr-2" />
                    End Interview
                </Button>
            </div>

            {/* AI Orb */}
            <div className="flex items-center justify-center py-8">
                <AIOrb mode={orbState} />
            </div>

            {/* Transcript */}
            <Card className="flex-1 overflow-hidden">
                <div
                    ref={transcriptRef}
                    className="h-full overflow-y-auto p-6 space-y-4"
                >
                    <AnimatePresence>
                        {transcript.map((turn, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                                className={`flex ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[80%] rounded-lg p-4 ${turn.speaker === 'user'
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                                        }`}
                                >
                                    <p className="text-sm font-medium mb-1">
                                        {turn.speaker === 'user' ? 'You' : 'AI Interviewer'}
                                    </p>
                                    <p className="text-sm">{turn.content}</p>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </Card>

            {/* Controls */}
            <div className="flex flex-col items-center justify-center space-y-4">
                {!isInterviewStarted ? (
                    <Button
                        size="lg"
                        onClick={startInterview}
                        className="px-8"
                        disabled={!!error && error.includes('not supported')}
                    >
                        Start Interview
                    </Button>
                ) : isInterviewComplete ? (
                    <Button
                        size="lg"
                        onClick={onComplete}
                        className="px-8"
                    >
                        View Results
                    </Button>
                ) : (
                    <div className="flex flex-col items-center space-y-4">
                        <div className="flex items-center space-x-2">
                            {isRecording ? (
                                <div className="flex items-center space-x-2 text-green-600">
                                    <Mic className="w-5 h-5 animate-pulse" />
                                    <span className="text-sm font-medium">Listening...</span>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2 text-gray-500">
                                    <MicOff className="w-5 h-5" />
                                    <span className="text-sm font-medium">Microphone ready</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Error message */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}
        </div>
    )
}
