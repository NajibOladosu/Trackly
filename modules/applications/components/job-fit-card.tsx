"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Loader2, Target, Lightbulb, KeyRound, Sparkles } from "lucide-react"

interface JobFitResult {
  score: number
  tips: string[]
  missingKeywords: string[]
  summary: string
}

interface JobFitCardProps {
  jobDescription: string | null
  documentId?: string
}

function scoreTone(score: number) {
  if (score >= 75) return { text: "text-primary", ring: "border-primary", label: "Strong match" }
  if (score >= 50) return { text: "text-yellow-400", ring: "border-yellow-400", label: "Partial match" }
  return { text: "text-destructive", ring: "border-destructive", label: "Weak match" }
}

export function JobFitCard({ jobDescription, documentId }: JobFitCardProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<JobFitResult | null>(null)

  const hasJobDescription = !!jobDescription && jobDescription.trim().length > 0

  const runCheck = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/ai/compatibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, documentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || "Failed to analyze fit")
      }
      setResult(data as JobFitResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze fit")
    } finally {
      setLoading(false)
    }
  }

  if (!hasJobDescription) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Target className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No job description yet</h3>
          <p className="text-sm text-muted-foreground">
            Add a job description to this application to score how well your resume fits.
          </p>
        </CardContent>
      </Card>
    )
  }

  const tone = result ? scoreTone(result.score) : null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Job Fit
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              How well your resume matches this posting, with tips to close the gap.
            </p>
          </div>
          <Button onClick={runCheck} disabled={loading} className="glow-effect shrink-0">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {result ? "Re-analyze" : "Analyze fit"}
              </>
            )}
          </Button>
        </CardHeader>

        {error && (
          <CardContent className="pt-0">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        )}

        {result && tone && (
          <CardContent className="space-y-6">
            {/* Score */}
            <div className="flex items-center gap-5">
              <div
                className={`h-24 w-24 rounded-full border-4 ${tone.ring} flex flex-col items-center justify-center shrink-0`}
              >
                <span className={`text-3xl font-bold ${tone.text}`}>{result.score}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">/ 100</span>
              </div>
              <div>
                <p className={`text-sm font-semibold ${tone.text}`}>{tone.label}</p>
                <p className="text-sm text-muted-foreground mt-1">{result.summary}</p>
              </div>
            </div>

            {/* Tips */}
            {result.tips?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  Ways to improve your fit
                </h4>
                <ul className="space-y-2">
                  {result.tips.map((tip, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="text-primary">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Missing keywords */}
            {result.missingKeywords?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <KeyRound className="h-4 w-4 text-primary" />
                  Missing keywords
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.missingKeywords.map((kw, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {kw}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
