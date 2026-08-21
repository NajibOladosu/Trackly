"use client"

import { useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import type { Application, Document } from "@/types/database"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import {
    Loader2,
    Sparkles,
    AlertTriangle,
    CheckCircle,
    FileText,
    Target,
    XCircle,
    Lightbulb,
    ScanSearch,
    Edit
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/shared/lib/utils"
import type { ResumeAnalysisResult } from "./resume-feedback"

const ResumeEditor = dynamic(
    () => import("./resume-editor").then((mod) => mod.ResumeEditor),
    { ssr: false }
)

interface AnalysisTabProps {
    application: Application
    documents: Document[]
}

export function AnalysisTab({ application, documents }: AnalysisTabProps) {
    const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
        application.last_analyzed_document_id || null
    )
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysis, setAnalysis] = useState<ResumeAnalysisResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<"analysis" | "editor">("analysis")
    const [analysisCache, setAnalysisCache] = useState<Record<string, ResumeAnalysisResult>>({})

    const selectedDocument = useMemo(() =>
        documents.find(d => d.id === selectedDocumentId),
        [documents, selectedDocumentId]
    )

    // Initialize cache from documents
    useEffect(() => {
        const initialCache: Record<string, ResumeAnalysisResult> = {}
        documents.forEach(doc => {
            if (doc.analysis_result) {
                initialCache[doc.id] = doc.analysis_result
            }
        })
        setAnalysisCache(prev => ({ ...prev, ...initialCache }))
    }, [documents])

    // Update displayed analysis when selection changes
    useEffect(() => {
        if (!selectedDocumentId) {
            setAnalysis(null)
            return
        }

        const cached = analysisCache[selectedDocumentId]
        if (cached) {
            setAnalysis(cached)
        } else {
            // Check if the document has it (could be newer references)
            const doc = documents.find(d => d.id === selectedDocumentId)
            if (doc?.analysis_result) {
                setAnalysis(doc.analysis_result)
            } else {
                setAnalysis(null)
            }
        }
    }, [selectedDocumentId, analysisCache, documents])

    const handleAnalyze = async () => {
        if (!selectedDocumentId) return
        if (!application.job_description) {
            setError("No job description found. Please add a job description to the application first.")
            return
        }

        setIsAnalyzing(true)
        setError(null)
        setAnalysis(null)

        try {
            const response = await fetch('/api/applications/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    applicationId: application.id,
                    documentId: selectedDocumentId,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to analyze resume')
            }

            setAnalysis(data.analysis)
            setAnalysisCache(prev => ({
                ...prev,
                [selectedDocumentId]: data.analysis
            }))
        } catch (err) {
            console.error('Analysis error:', err)
            setError(err instanceof Error ? err.message : 'An unexpected error occurred during analysis.')
        } finally {
            setIsAnalyzing(false)
        }
    }

    // Helper to format score background
    const getScoreBg = (score: number) => {
        if (score >= 80) return "bg-primary" // green
        if (score >= 60) return "bg-orange-500"
        return "bg-red-500"
    }

    // Helper to format score text color for card
    const getScoreCardTextColor = (score: number) => {
        if (score >= 80) return "text-black" // black on green
        if (score >= 60) return "text-black" // black on orange
        return "text-white" // white on red
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

    if (viewMode === "editor" && selectedDocument) {
        return (
            <ResumeEditor
                documentUrl={selectedDocument.file_url}
                analysis={analysis}
                parsedData={selectedDocument.parsed_data}
                extractedText={selectedDocument.extracted_text}
                applicationId={application.id}
                documentId={selectedDocument.id}
                onBack={() => setViewMode("analysis")}
                fileName={selectedDocument.file_name}
            />
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <ScanSearch className="h-6 w-6 text-foreground dark:text-primary" />
                        Resume Analysis
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Analyze your resume against the job description to identify gaps and optimize for ATS.
                    </p>
                </div>
            </div>

            {/* Control Panel */}
            <Card className="border-primary/20 bg-muted/10">
                <CardContent className="pt-6">
                    <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                        <div className="flex-1 min-w-0 space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Select Resume
                            </label>
                            {documents.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {documents.map((doc) => (
                                        <div
                                            key={doc.id}
                                            onClick={() => setSelectedDocumentId(doc.id)}
                                            className={cn(
                                                "cursor-pointer rounded-lg border p-3 flex items-center gap-3 transition-all hover:bg-muted",
                                                selectedDocumentId === doc.id
                                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                    : "border-input"
                                            )}
                                        >
                                            <div className="p-2 rounded bg-background border flex items-center justify-center">
                                                <FileText className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="overflow-hidden flex-1">
                                                <p className="text-sm font-medium truncate">{doc.file_name}</p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {((doc.file_size || 0) / 1024).toFixed(0)} KB
                                                </p>
                                            </div>
                                            {selectedDocumentId === doc.id && (
                                                <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-6 border border-dashed rounded-lg text-center text-muted-foreground bg-muted/20">
                                    <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                                    <p className="font-medium">No documents attached to this application.</p>
                                    <p className="text-sm mt-1">Go to the Documents section to upload a resume.</p>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-2 lg:w-56 lg:self-end lg:pb-0">
                            {selectedDocumentId && (
                                <Button
                                    variant="outline"
                                    onClick={() => setViewMode("editor")}
                                    className="w-full justify-center"
                                >
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit Resume
                                </Button>
                            )}

                            <Button
                                onClick={handleAnalyze}
                                disabled={!selectedDocumentId || isAnalyzing || !application.job_description}
                                className="w-full justify-center glow-effect relative overflow-hidden group"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-2 h-4 w-4 group-hover:animate-pulse" />
                                        {analysis ? "Re-Analyze" : "Run Analysis"}
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {error && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-500 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            {error}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Analysis Result */}
            <AnimatePresence mode="wait">
                {analysis && !isAnalyzing && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="space-y-6"
                    >
                        {/* Score Overview */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card className={cn("md:col-span-1 overflow-hidden relative flex flex-col items-center justify-center min-h-[280px]", getScoreBg(analysis.score))}>
                                <CardContent className="flex flex-col items-center justify-center py-6">
                                    <p className={cn("text-sm font-medium mb-1", getScoreCardTextColor(analysis.score))}>Match Score</p>
                                    <p className={cn("text-xs mb-4", getScoreCardTextColor(analysis.score), "opacity-70")}>Compatibility with Job Description</p>
                                    <div className="relative flex items-center justify-center h-32 w-32">
                                        <svg className="h-full w-full -rotate-90 text-white/30" viewBox="0 0 100 100">
                                            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" />
                                        </svg>
                                        <motion.svg
                                            initial={{ pathLength: 0 }}
                                            animate={{ pathLength: analysis.score / 100 }}
                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                            className="h-full w-full -rotate-90 absolute inset-0 text-white"
                                            viewBox="0 0 100 100"
                                        >
                                            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="251.2" strokeLinecap="round" />
                                        </motion.svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className={cn("text-4xl font-bold", getScoreCardTextColor(analysis.score))}>
                                                {analysis.score}
                                            </span>
                                            <span className={cn("text-xs font-medium uppercase tracking-wider", getScoreCardTextColor(analysis.score), "opacity-70")}>/ 100</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className={cn("md:col-span-2", analysis.score < 60 ? "border-red-500/50" : analysis.score < 80 ? "border-orange-500/50" : "border-border")}>
                                <CardHeader>
                                    <CardTitle className={cn("flex items-center gap-2", analysis.score < 60 ? "text-red-500" : analysis.score < 80 ? "text-orange-600" : "text-foreground")}>
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
                                                <Badge
                                                    key={i}
                                                    variant="outline"
                                                    className={cn(
                                                        "px-3 py-1 text-sm font-medium",
                                                        analysis.score < 60
                                                            ? "border-red-500/40 text-red-500 bg-red-500/5"
                                                            : analysis.score < 80
                                                                ? "border-orange-500/40 text-orange-600 bg-orange-500/5"
                                                                : "border-primary/40 text-primary bg-primary/5"
                                                    )}
                                                >
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
                )}
            </AnimatePresence>
        </div>
    )
}
