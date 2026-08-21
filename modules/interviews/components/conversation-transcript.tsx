'use client'

import { useState } from 'react'
import { Card } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { Download } from 'lucide-react'
import { motion } from 'framer-motion'
import type { ConversationTurn } from '@/types/database'

interface ConversationTranscriptProps {
    sessionId: string
    transcript: ConversationTurn[]
    onClose?: () => void
}

export function ConversationTranscript({ sessionId, transcript, onClose }: ConversationTranscriptProps) {
    const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set())

    const toggleTurn = (turnId: string) => {
        setExpandedTurns(prev => {
            const next = new Set(prev)
            if (next.has(turnId)) {
                next.delete(turnId)
            } else {
                next.add(turnId)
            }
            return next
        })
    }

    const downloadTranscript = () => {
        const text = transcript
            .map(turn => {
                const speaker = turn.speaker === 'ai' ? 'AI Interviewer' : 'You'
                const timestamp = new Date(turn.timestamp).toLocaleTimeString()
                return `[${timestamp}] ${speaker}:\n${turn.content}\n`
            })
            .join('\n')

        const blob = new Blob([text], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `interview-transcript-${sessionId}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const aiTurns = transcript.filter(t => t.speaker === 'ai')
    const userTurns = transcript.filter(t => t.speaker === 'user')
    const duration = transcript.length > 0
        ? Math.round((new Date(transcript[transcript.length - 1].timestamp).getTime() -
            new Date(transcript[0].timestamp).getTime()) / 1000 / 60)
        : 0

    return (
        <div className="space-y-6">
            {/* Header with stats */}
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-bold mb-2">Interview Transcript</h2>
                    <div className="flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
                        <div>
                            <span className="font-medium">{transcript.length}</span> total turns
                        </div>
                        <div>
                            <span className="font-medium">{userTurns.length}</span> responses
                        </div>
                        <div>
                            <span className="font-medium">{duration}</span> minutes
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadTranscript}
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                    </Button>
                    {onClose && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onClose}
                        >
                            Close
                        </Button>
                    )}
                </div>
            </div>

            {/* Transcript */}
            <Card className="p-6">
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {transcript.map((turn, index) => {
                        const isExpanded = expandedTurns.has(turn.id)
                        const isLongContent = turn.content.length > 200

                        return (
                            <motion.div
                                key={turn.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className={`flex ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] rounded-lg p-4 ${turn.speaker === 'user'
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-semibold uppercase tracking-wide opacity-75">
                                            {turn.speaker === 'user' ? 'You' : 'AI Interviewer'}
                                        </p>
                                        <p className="text-xs opacity-60">
                                            {new Date(turn.timestamp).toLocaleTimeString()}
                                        </p>
                                    </div>

                                    <div className="text-sm">
                                        {isLongContent && !isExpanded ? (
                                            <>
                                                <p>{turn.content.substring(0, 200)}...</p>
                                                <button
                                                    onClick={() => toggleTurn(turn.id)}
                                                    className="mt-2 text-xs underline opacity-75 hover:opacity-100"
                                                >
                                                    Show more
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <p className="whitespace-pre-wrap">{turn.content}</p>
                                                {isLongContent && (
                                                    <button
                                                        onClick={() => toggleTurn(turn.id)}
                                                        className="mt-2 text-xs underline opacity-75 hover:opacity-100"
                                                    >
                                                        Show less
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* Metadata badges */}
                                    {turn.metadata && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {turn.metadata.type && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10">
                                                    {turn.metadata.type}
                                                </span>
                                            )}
                                            {turn.metadata.questionNumber && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10">
                                                    Q{turn.metadata.questionNumber}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            </Card>

            {/* Summary */}
            <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20">
                <h3 className="font-semibold mb-3">Interview Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                        <p className="text-gray-600 dark:text-gray-400 mb-1">Total Exchanges</p>
                        <p className="text-2xl font-bold">{transcript.length}</p>
                    </div>
                    <div>
                        <p className="text-gray-600 dark:text-gray-400 mb-1">Your Responses</p>
                        <p className="text-2xl font-bold">{userTurns.length}</p>
                    </div>
                    <div>
                        <p className="text-gray-600 dark:text-gray-400 mb-1">AI Questions</p>
                        <p className="text-2xl font-bold">{aiTurns.length}</p>
                    </div>
                    <div>
                        <p className="text-gray-600 dark:text-gray-400 mb-1">Duration</p>
                        <p className="text-2xl font-bold">{duration}m</p>
                    </div>
                </div>
            </Card>
        </div>
    )
}
