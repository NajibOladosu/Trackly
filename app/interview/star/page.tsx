"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Label } from "@/shared/ui/label"
import { useToast } from "@/shared/ui/use-toast"
import { ConfirmModal } from "@/components/modals/confirm-modal"
import { ArrowLeft, Copy, Save, Plus, Trash2, Pencil, Sparkles } from "lucide-react"
import {
  STAR_SECTIONS,
  composeStarAnswer,
  starCompleteness,
  type StarAnswer,
  type StarParts,
} from "@/modules/interviews/lib/star"

const STORAGE_KEY = "applyos:starAnswers"

const EMPTY_FORM: { question: string } & StarParts = {
  question: "",
  situation: "",
  task: "",
  action: "",
  result: "",
}

export default function StarBuilderPage() {
  const { toast } = useToast()
  const [answers, setAnswers] = useState<StarAnswer[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Load saved answers once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setAnswers(JSON.parse(raw) as StarAnswer[])
    } catch {
      // Corrupt or unavailable storage — start empty.
    }
    setHydrated(true)
  }, [])

  // Persist whenever the library changes (after the initial load).
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(answers))
    } catch {
      // Best-effort persistence only.
    }
  }, [answers, hydrated])

  const parts: StarParts = {
    situation: form.situation,
    task: form.task,
    action: form.action,
    result: form.result,
  }

  const composed = useMemo(() => composeStarAnswer(parts), [parts])
  const completeness = starCompleteness(parts)
  const hasContent = composed.trim().length > 0 || form.question.trim().length > 0

  const setField = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  const handleSave = () => {
    if (!hasContent) return
    const now = new Date().toISOString()

    if (editingId) {
      setAnswers((prev) =>
        prev.map((a) => (a.id === editingId ? { ...a, ...form, updatedAt: now } : a))
      )
      toast({ title: "Answer updated" })
    } else {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `star-${now}-${Math.round(completeness * 1000)}`
      setAnswers((prev) => [
        { id, ...form, createdAt: now, updatedAt: now },
        ...prev,
      ])
      toast({ title: "Answer saved to your library" })
    }
    resetForm()
  }

  const handleEdit = (answer: StarAnswer) => {
    setForm({
      question: answer.question,
      situation: answer.situation,
      task: answer.task,
      action: answer.action,
      result: answer.result,
    })
    setEditingId(answer.id)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleDelete = () => {
    if (!deleteId) return
    setAnswers((prev) => prev.filter((a) => a.id !== deleteId))
    if (editingId === deleteId) resetForm()
    setDeleteId(null)
  }

  const copyAnswer = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: "Copied to clipboard" })
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" })
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div>
          <Link
            href="/interview"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Interview Practice
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary" />
            STAR Answer Builder
          </h1>
          <p className="text-muted-foreground mt-2">
            Build strong behavioral answers using the Situation, Task, Action, Result framework.
            Answers are saved in this browser.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Builder */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>{editingId ? "Edit answer" : "New answer"}</CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1.5 w-24 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${completeness * 100}%` }}
                    />
                  </div>
                  <span>{Math.round(completeness * 4)}/4</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="question">Question / prompt</Label>
                  <Input
                    id="question"
                    placeholder="e.g. Tell me about a time you handled a conflict on your team."
                    value={form.question}
                    onChange={(e) => setField("question", e.target.value)}
                  />
                </div>

                {STAR_SECTIONS.map((section) => (
                  <div key={section.key} className="space-y-1.5">
                    <Label htmlFor={section.key}>{section.label}</Label>
                    <p className="text-xs text-muted-foreground">{section.hint}</p>
                    <Textarea
                      id={section.key}
                      rows={3}
                      value={form[section.key]}
                      onChange={(e) => setField(section.key, e.target.value)}
                    />
                  </div>
                ))}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={handleSave} disabled={!hasContent} className="glow-effect">
                    <Save className="mr-2 h-4 w-4" />
                    {editingId ? "Update answer" : "Save answer"}
                  </Button>
                  {(editingId || hasContent) && (
                    <Button variant="outline" onClick={resetForm}>
                      <Plus className="mr-2 h-4 w-4" />
                      New
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Live preview */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Preview</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyAnswer(composed)}
                  disabled={!composed.trim()}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </CardHeader>
              <CardContent>
                {composed.trim() ? (
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{composed}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Fill in the sections above to see your composed answer.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Library */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Your saved answers ({answers.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {answers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No saved answers yet. Build one and save it to reuse before interviews.
                  </p>
                ) : (
                  answers.map((answer) => (
                    <div key={answer.id} className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium flex-1 min-w-0">
                          {answer.question || "Untitled answer"}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => copyAnswer(composeStarAnswer(answer))}
                            aria-label="Copy answer"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(answer)}
                            aria-label="Edit answer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(answer.id)}
                            aria-label="Delete answer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-3 whitespace-pre-wrap">
                        {composeStarAnswer(answer)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete answer?"
        description="This removes the saved STAR answer from this browser. This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </DashboardLayout>
  )
}
