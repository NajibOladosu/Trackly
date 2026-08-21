
"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { Target, XCircle, Lightbulb, CheckCircle, AlertTriangle } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/shared/lib/utils"

export type ResumeAnalysisResult = {
    score: number           // 0-100
    matchingKeywords: string[]
    missingKeywords: string[]
    strengths: string[]
    weaknesses: string[]
    recommendations: string[]
}

interface ResumeFeedbackProps {
    analysis: ResumeAnalysisResult
    compact?: boolean
}

export function ResumeFeedback({ analysis, compact = false }: ResumeFeedbackProps) {
    // Helper to format score color
    const getScoreColor = (score: number) => {
        if (score >= 80) return "text-green-500"
        if (score >= 60) return "text-yellow-500"
        return "text-red-500"
    }

    const getScoreBg = (score: number) => {
        if (score >= 80) return "bg-green-500"
        if (score >= 60) return "bg-yellow-500"
        return "bg-red-500"
    }

    // Helper to render text with markdown bold support
    const renderMarkdown = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g)
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
            }
            return <span key={i}>{part}</span>
        })
    }

    if (compact) {
        return (
            <div className="space-y-4">
                {/* Compact Score */}
                <Card className="overflow-hidden relative border-primary/20">
                    <div className={cn("absolute inset-0 opacity-5", getScoreBg(analysis.score))} />
                    <CardHeader className="pb-2 p-4">
                        <CardTitle className="text-base">Match Score</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 flex items-center gap-4">
                        <div className={cn("text-3xl font-bold", getScoreColor(analysis.score))}>
                            {analysis.score}<span className="text-sm text-muted-foreground font-medium">/100</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Compact Missing Keywords */}
                {analysis.missingKeywords.length > 0 && (
                    <Card className="border-red-500/20">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm text-red-500 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                Missing Keywords
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="flex flex-wrap gap-1.5">
                                {analysis.missingKeywords.map((keyword, i) => (
                                    <Badge key={i} variant="outline" className="text-xs border-red-500/40 text-red-500 bg-red-500/5 hover:bg-red-500/10">
                                        {keyword}
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Compact Recommendations */}
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Lightbulb className="h-4 w-4 text-primary" />
                            Top Recommendations
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <ul className="space-y-3">
                            {analysis.recommendations.slice(0, 3).map((rec, i) => (
                                <li key={i} className="text-xs flex gap-2">
                                    <span className="font-bold text-primary shrink-0">{i + 1}.</span>
                                    <span>{renderMarkdown(rec)}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
        >
            {/* Score Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-1 overflow-hidden relative">
                    <div className={cn("absolute inset-0 opacity-5", getScoreBg(analysis.score))} />
                    <CardHeader className="pb-2">
                        <CardTitle>Match Score</CardTitle>
                        <CardDescription>Compatibility with Job Description</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center py-6">
                        <div className="relative flex items-center justify-center h-32 w-32">
                            <svg className="h-full w-full -rotate-90 text-muted/20" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" />
                            </svg>
                            <motion.svg
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: analysis.score / 100 }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className={cn("h-full w-full -rotate-90 absolute inset-0", getScoreColor(analysis.score))}
                                viewBox="0 0 100 100"
                            >
                                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="251.2" strokeLinecap="round" />
                            </motion.svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className={cn("text-4xl font-bold", getScoreColor(analysis.score))}>
                                    {analysis.score}
                                </span>
                                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">/ 100</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-red-500 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Critical ATS Missing Keywords
                        </CardTitle>
                        <CardDescription>
                            These keywords appear frequently in the job description but are missing from your resume.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {analysis.missingKeywords.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {analysis.missingKeywords.map((keyword, i) => (
                                    <Badge key={i} variant="outline" className="border-red-500/40 text-red-500 bg-red-500/5 px-3 py-1 text-sm font-medium">
                                        {keyword}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-green-500 bg-green-500/10 p-4 rounded-lg">
                                <CheckCircle className="h-5 w-5" />
                                <span className="font-medium">Great job! No critical keywords missing.</span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Strengths & Weaknesses Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                            <Target className="h-5 w-5" />
                            Strengths
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-3">
                            {analysis.strengths.map((str, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                                    <span className="text-sm">{renderMarkdown(str)}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                            <XCircle className="h-5 w-5" />
                            Weaknesses & Gaps
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-3">
                            {analysis.weaknesses.map((weak, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                                    <span className="text-sm">{renderMarkdown(weak)}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>

            {/* Recommendations */}
            <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-primary" />
                        Actionable Recommendations
                    </CardTitle>
                    <CardDescription>
                        Specific steps to improve your resume for this application.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {analysis.recommendations.map((rec, i) => (
                            <div key={i} className="flex gap-4 p-4 bg-background rounded-lg border shadow-sm">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                                    <span className="text-primary font-bold text-sm">{i + 1}</span>
                                </div>
                                <p className="text-sm pt-1">{renderMarkdown(rec)}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

        </motion.div>
    )
}
