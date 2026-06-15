"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, Link2, ClipboardPaste, RefreshCw, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { useToast } from "@/shared/ui/use-toast"
import { getAnalyzedDocuments } from "@/modules/documents/services/document.service"
import type { Document } from "@/types/database"
import {
  runApplyKit,
  createApplyKitClient,
  type StepStatus,
  type FitResult,
  type ApplyKitInput,
} from "@/modules/applications/services/apply-kit"

type Mode = "url" | "text"

export function ApplyKitScreen() {
  const { toast } = useToast()
  const client = useMemo(() => createApplyKitClient(), [])
  const [mode, setMode] = useState<Mode>("text")
  const [url, setUrl] = useState("")
  const [text, setText] = useState("")
  const [docs, setDocs] = useState<Document[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [documentId, setDocumentId] = useState<string>("")
  const [running, setRunning] = useState(false)

  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [jobTitle, setJobTitle] = useState<string | null>(null)
  const [jobCompany, setJobCompany] = useState<string | null>(null)
  const [jobDescription, setJobDescription] = useState("")

  const [jobStatus, setJobStatus] = useState<StepStatus | "idle">("idle")
  const [fitStatus, setFitStatus] = useState<StepStatus | "idle">("idle")
  const [coverStatus, setCoverStatus] = useState<StepStatus | "idle">("idle")
  const [fit, setFit] = useState<FitResult | null>(null)
  const [coverLetter, setCoverLetter] = useState<string | null>(null)

  useEffect(() => {
    getAnalyzedDocuments()
      .then((d) => {
        setDocs(d)
        if (d.length > 0) setDocumentId(d[0].id)
      })
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false))
  }, [])

  function resetResults() {
    setApplicationId(null)
    setJobTitle(null)
    setJobCompany(null)
    setJobDescription("")
    setJobStatus("idle")
    setFitStatus("idle")
    setCoverStatus("idle")
    setFit(null)
    setCoverLetter(null)
  }

  async function handleGenerate() {
    if (mode === "url" && !url.trim()) return toast({ title: "Enter a job URL", variant: "destructive" })
    if (mode === "text" && !text.trim()) return toast({ title: "Paste a job description", variant: "destructive" })
    if (!documentId) return toast({ title: "Pick a resume first", variant: "destructive" })

    resetResults()
    setRunning(true)
    const input: ApplyKitInput = mode === "url" ? { url: url.trim() } : { text: text.trim() }

    let jobErrored = false
    try {
      const result = await runApplyKit(input, documentId, client, (e) => {
        if (e.step === "job") {
          setJobStatus(e.status)
          if (e.status === "error") {
            jobErrored = true
            toast({ title: "Couldn't read the job", description: e.error, variant: "destructive" })
          }
        }
        if (e.step === "fit") setFitStatus(e.status)
        if (e.step === "coverLetter") setCoverStatus(e.status)
      })
      setApplicationId(result.applicationId)
      setJobTitle(result.job.title)
      setJobCompany(result.job.company)
      setJobDescription(result.job.job_description)
      setFit(result.fit)
      setCoverLetter(result.coverLetter)
    } catch (e) {
      if (!jobErrored) {
        toast({ title: "Something went wrong", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      }
    } finally {
      setRunning(false)
    }
  }

  async function retryFit() {
    if (!jobDescription) return
    setFitStatus("loading")
    try {
      const r = await client.scoreFit(jobDescription, documentId)
      setFit(r)
      setFitStatus("done")
    } catch (e) {
      setFitStatus("error")
      toast({ title: "Fit retry failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  async function retryCover() {
    if (!applicationId) return
    setCoverStatus("loading")
    try {
      const cl = await client.generateCoverLetter(applicationId)
      setCoverLetter(cl)
      setCoverStatus("done")
    } catch (e) {
      setCoverStatus("error")
      toast({ title: "Cover letter retry failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">One-Click Apply Kit</h1>
        <p className="text-muted-foreground text-sm">Paste a job link or description, pick a resume, and generate your application, fit score, and cover letter.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-2">
            <Button variant={mode === "text" ? "default" : "outline"} size="sm" aria-pressed={mode === "text"} onClick={() => setMode("text")}>
              <ClipboardPaste className="mr-2 h-4 w-4" /> Paste JD
            </Button>
            <Button variant={mode === "url" ? "default" : "outline"} size="sm" aria-pressed={mode === "url"} onClick={() => setMode("url")}>
              <Link2 className="mr-2 h-4 w-4" /> Job URL
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "url" ? (
            <input
              id="job-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://company.com/careers/role"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          ) : (
            <textarea
              id="job-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the full job description here..."
              rows={8}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          )}

          <div>
            <label htmlFor="resume-select" className="mb-1 block text-sm font-medium">Resume</label>
            {docsLoading ? (
              <p className="text-muted-foreground text-sm">Loading resumes…</p>
            ) : docs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No analyzed resume found. <Link href="/upload" className="underline">Upload one</Link> first.
              </p>
            ) : (
              <select
                id="resume-select"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>{d.file_name}</option>
                ))}
              </select>
            )}
          </div>

          <Button onClick={handleGenerate} disabled={running || docsLoading || docs.length === 0} className="w-full">
            {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</> : "Generate Apply Kit"}
          </Button>
        </CardContent>
      </Card>

      {jobStatus !== "idle" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Application</CardTitle></CardHeader>
          <CardContent>
            {jobStatus === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
            {jobStatus === "done" && (
              <div className="space-y-2">
                <p className="font-medium">{jobTitle}{jobCompany ? ` — ${jobCompany}` : ""}</p>
                {applicationId && (
                  <Link href={`/applications/${applicationId}`} className="inline-flex items-center text-sm underline">
                    Open application <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                )}
              </div>
            )}
            {jobStatus === "error" && <p className="text-sm text-destructive">Could not read the job posting.</p>}
          </CardContent>
        </Card>
      )}

      {fitStatus !== "idle" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Resume Fit</CardTitle></CardHeader>
          <CardContent>
            {fitStatus === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
            {fitStatus === "done" && fit && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold">{fit.score}%</span>
                  <span className="text-muted-foreground text-sm">{fit.summary}</span>
                </div>
                {fit.missingKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {fit.missingKeywords.map((k) => <Badge key={k} variant="outline">{k}</Badge>)}
                  </div>
                )}
              </div>
            )}
            {fitStatus === "error" && (
              <Button variant="outline" size="sm" onClick={retryFit}><RefreshCw className="mr-2 h-4 w-4" /> Retry fit</Button>
            )}
          </CardContent>
        </Card>
      )}

      {coverStatus !== "idle" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Cover Letter</CardTitle></CardHeader>
          <CardContent>
            {coverStatus === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
            {coverStatus === "done" && (
              coverLetter ? (
                <div className="space-y-2">
                  <p className="whitespace-pre-wrap text-sm">{coverLetter}</p>
                  {applicationId && <Link href={`/applications/${applicationId}`} className="text-sm underline">Edit in application</Link>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No cover letter was generated.</p>
              )
            )}
            {coverStatus === "error" && (
              <Button variant="outline" size="sm" onClick={retryCover}><RefreshCw className="mr-2 h-4 w-4" /> Retry cover letter</Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
