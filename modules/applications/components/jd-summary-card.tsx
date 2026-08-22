"use client"

import { useState } from "react"
import { Button } from "@/shared/ui/button"
import { Loader2, Sparkles, ListChecks, CheckCircle2, PlusCircle, AlertTriangle } from "lucide-react"

interface JdSummary {
  summary: string
  keyResponsibilities: string[]
  mustHaves: string[]
  niceToHaves: string[]
  redFlags: string[]
}

interface JdSummaryCardProps {
  jobDescription: string
}

function Section({
  title,
  items,
  icon: Icon,
  tone,
}: {
  title: string
  items: string[]
  icon: typeof ListChecks
  tone: string
}) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <h4 className={`text-xs font-semibold flex items-center gap-1.5 mb-2 ${tone}`}>
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-muted-foreground">
            <span className="text-muted-foreground/50">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function JdSummaryCard({ jobDescription }: JdSummaryCardProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<JdSummary | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/ai/summarize-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to summarize")
      setResult(data as JdSummary)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to summarize")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3">
      {!result && (
        <Button variant="outline" size="sm" onClick={run} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Summarizing
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Summarize with AI
            </>
          )}
        </Button>
      )}

      {error && <p className="text-sm text-destructive mt-2">{error}</p>}

      {result && (
        <div className="space-y-4 rounded border border-input bg-muted/20 p-4">
          {result.summary && <p className="text-sm font-medium">{result.summary}</p>}
          <Section title="Key responsibilities" items={result.keyResponsibilities} icon={ListChecks} tone="text-foreground" />
          <Section title="Must-haves" items={result.mustHaves} icon={CheckCircle2} tone="text-primary" />
          <Section title="Nice-to-haves" items={result.niceToHaves} icon={PlusCircle} tone="text-sky-400" />
          <Section title="Red flags" items={result.redFlags} icon={AlertTriangle} tone="text-destructive" />
          <Button variant="ghost" size="sm" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Re-summarize
          </Button>
        </div>
      )}
    </div>
  )
}
