'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Badge } from '@/shared/ui/badge'
import { X, TrendingUp, TrendingDown, Minus, RotateCw } from 'lucide-react'
import type { InterviewSession, InterviewQuestion, InterviewAnswer, InterviewFeedback } from '@/types/database'

// The feedback payload returned by the report API may include an
// `areas_for_improvement` list in addition to the stored feedback shape.
type ReportFeedback = InterviewFeedback & { areas_for_improvement?: string[] }
type ReportAnswer = Omit<InterviewAnswer, 'feedback'> & { feedback: ReportFeedback }

export interface InterviewReportData {
    session: InterviewSession
    questions: InterviewQuestion[]
    answers: ReportAnswer[]
}

interface InterviewReportModalProps {
    isOpen: boolean
    onClose: () => void
    reportData: InterviewReportData | null
    sessionId: string
    onRetake?: () => void
}

export function InterviewReportModal({
    isOpen,
    onClose,
    reportData,
    onRetake,
}: InterviewReportModalProps) {
    if (!reportData) return null

    const { session, questions, answers } = reportData
    const avgScore = session.average_score || 0

    const getScoreColor = (score: number) => {
        if (score >= 8) return 'text-green-600 dark:text-green-400'
        if (score >= 6) return 'text-yellow-600 dark:text-yellow-400'
        return 'text-red-600 dark:text-red-400'
    }

    const getScoreBadge = (score: number) => {
        if (score >= 8) return { variant: 'success' as const, label: 'Excellent', icon: TrendingUp }
        if (score >= 6) return { variant: 'warning' as const, label: 'Good', icon: Minus }
        return { variant: 'destructive' as const, label: 'Needs Improvement', icon: TrendingDown }
    }

    const sessionTypeLabels: Record<string, string> = {
        behavioral: 'Behavioral',
        technical: 'Technical',
        mixed: 'Mixed',
        resume_grill: 'Resume Grill',
        company_specific: 'Company-Specific',
    }

    const difficultyColors = {
        easy: 'bg-green-500/10 text-green-700 dark:text-green-400',
        medium: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
        hard: 'bg-red-500/10 text-red-700 dark:text-red-400',
    }

    const scoreBadge = getScoreBadge(avgScore)
    const ScoreIcon = scoreBadge.icon

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
                <DialogHeader className="p-6 pb-4">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <DialogTitle className="text-2xl flex items-center gap-3">
                                {sessionTypeLabels[session.session_type] || session.session_type}
                                {session.company_name && (
                                    <Badge variant="outline" className="text-sm font-normal">
                                        {session.company_name}
                                    </Badge>
                                )}
                            </DialogTitle>
                            <DialogDescription className="mt-2 flex flex-wrap items-center gap-3">
                                <span>
                                    {new Date(session.created_at).toLocaleDateString()} at{' '}
                                    {new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <Badge
                                    variant="outline"
                                    className={`capitalize ${session.difficulty && difficultyColors[session.difficulty as keyof typeof difficultyColors] ? difficultyColors[session.difficulty as keyof typeof difficultyColors] : ''}`}
                                >
                                    {session.difficulty || 'medium'} difficulty
                                </Badge>
                            </DialogDescription>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6">
                    <div className="space-y-6 pb-6">
                        {/* Overall Stats */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Overall Performance</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">Questions</p>
                                    <p className="text-2xl font-bold">
                                        {session.answered_questions}/{session.total_questions}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Average Score</p>
                                    <div className="flex items-center gap-2">
                                        <p className={`text-2xl font-bold ${getScoreColor(avgScore)}`}>{avgScore.toFixed(1)}/10</p>
                                        <ScoreIcon className="h-5 w-5" />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Performance</p>
                                    <Badge variant={scoreBadge.variant} className="mt-1">
                                        {scoreBadge.label}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Status</p>
                                    <Badge variant="success" className="mt-1 bg-green-600 text-white">
                                        Completed
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Questions and Answers */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Question-by-Question Breakdown</h3>
                            {questions.map((question: InterviewQuestion, index: number) => {
                                const answer = answers.find((a: ReportAnswer) => a.question_id === question.id)
                                if (!answer) return null

                                const questionScore = answer.score || 0
                                const questionBadge = getScoreBadge(questionScore)

                                return (
                                    <Card key={question.id}>
                                        <CardHeader>
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Badge variant="outline" className="text-xs">
                                                            Q{index + 1}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-xs capitalize">
                                                            {question.question_category.replace('_', ' ')}
                                                        </Badge>
                                                    </div>
                                                    <CardTitle className="text-base font-medium">{question.question_text}</CardTitle>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className={`text-2xl font-bold ${getScoreColor(questionScore)}`}>
                                                        {questionScore.toFixed(1)}
                                                    </p>
                                                    <Badge variant={questionBadge.variant} className="text-xs mt-1">
                                                        {questionBadge.label}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {/* User's Answer */}
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground mb-2">Your Answer:</p>
                                                <p className="text-sm bg-secondary/50 p-3 rounded-md">{answer.answer_text}</p>
                                            </div>

                                            {/* Individual Scores */}
                                            {(answer.clarity_score || answer.structure_score || answer.relevance_score || answer.depth_score) && (
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    {answer.clarity_score && (
                                                        <div className="text-center p-2 bg-secondary/30 rounded">
                                                            <p className="text-xs text-muted-foreground">Clarity</p>
                                                            <p className="text-sm font-semibold">{answer.clarity_score}/10</p>
                                                        </div>
                                                    )}
                                                    {answer.structure_score && (
                                                        <div className="text-center p-2 bg-secondary/30  rounded">
                                                            <p className="text-xs text-muted-foreground">Structure</p>
                                                            <p className="text-sm font-semibold">{answer.structure_score}/10</p>
                                                        </div>
                                                    )}
                                                    {answer.relevance_score && (
                                                        <div className="text-center p-2 bg-secondary/30 rounded">
                                                            <p className="text-xs text-muted-foreground">Relevance</p>
                                                            <p className="text-sm font-semibold">{answer.relevance_score}/10</p>
                                                        </div>
                                                    )}
                                                    {answer.depth_score && (
                                                        <div className="text-center p-2 bg-secondary/30 rounded">
                                                            <p className="text-xs text-muted-foreground">Depth</p>
                                                            <p className="text-sm font-semibold">{answer.depth_score}/10</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Feedback */}
                                            {answer.feedback && (
                                                <div className="space-y-3">
                                                    {answer.feedback.strengths && answer.feedback.strengths.length > 0 && (
                                                        <div>
                                                            <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-1">
                                                                ✓ Strengths:
                                                            </p>
                                                            <ul className="text-sm space-y-1 ml-4">
                                                                {answer.feedback.strengths.map((strength: string, idx: number) => (
                                                                    <li key={idx} className="list-disc">
                                                                        {strength}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {answer.feedback.areas_for_improvement && answer.feedback.areas_for_improvement.length > 0 && (
                                                        <div>
                                                            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-1">
                                                                ⚠ Areas for Improvement:
                                                            </p>
                                                            <ul className="text-sm space-y-1 ml-4">
                                                                {answer.feedback.areas_for_improvement.map((area: string, idx: number) => (
                                                                    <li key={idx} className="list-disc">
                                                                        {area}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {answer.feedback.suggestions && answer.feedback.suggestions.length > 0 && (
                                                        <div>
                                                            <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">💡 Suggestions:</p>
                                                            <ul className="text-sm space-y-1 ml-4">
                                                                {answer.feedback.suggestions.map((suggestion: string, idx: number) => (
                                                                    <li key={idx} className="list-disc">
                                                                        {suggestion}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-between items-center p-6 pt-4 border-t">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    {onRetake && (
                        <Button onClick={onRetake} className="glow-effect">
                            <RotateCw className="h-4 w-4 mr-2" />
                            Retake Interview
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
