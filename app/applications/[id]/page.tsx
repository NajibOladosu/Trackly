"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Textarea } from "@/shared/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  Sparkles,
  Edit,
  RotateCw,
  Loader2,
  ChevronDown,
  Plus,
  X,
  Copy,
  StickyNote,
  ArrowUpDown,
  Mic,
  FileText,
  Trash2,
  MessageSquareText,
  Mail,
} from "lucide-react"
import Link from "next/link"
import type { Application, Question, Document, ApplicationNote } from "@/types/database"
import { getApplication, updateApplication, getApplicationDocuments, updateApplicationDocuments, getApplicationDocumentDetails } from "@/modules/applications/services/application.service"
import { getQuestionsByApplicationId, updateQuestion, deleteQuestion, createQuestion } from "@/modules/interviews/services/question.service"
import { getDocuments } from "@/modules/documents/services/document.service"
import { JobFitCard } from "@/modules/applications/components/job-fit-card"
import { getNotesByApplicationId, createNote, updateNote, deleteNote, togglePinNote } from "@/modules/notes/services/note.service"
import { getInterviewSessions, deleteInterviewSession } from "@/modules/interviews/services/interview.service"
import { EditApplicationModal } from "@/modules/applications/components/modals/edit-application-modal"
import { EditQuestionsModal } from "@/modules/interviews/components/modals/edit-questions-modal"
import { ConfirmModal } from "@/components/modals/confirm-modal"
import { AlertModal } from "@/components/modals/alert-modal"
import { NoteModal } from "@/modules/notes/components/modals/note-modal"
import { NewInterviewModal } from "@/modules/interviews/components/modals/new-interview-modal"
import { InterviewReportModal, type InterviewReportData } from "@/modules/interviews/components/modals/interview-report-modal"
import { NotesCardView } from "@/modules/notes/components/notes-card-view"
import { NotesTimelineView } from "@/modules/notes/components/notes-timeline-view"
import { RegenerateContextModal } from "@/components/modals/regenerate-context-modal"
import type { InterviewSession } from "@/types/database"
import dynamic from "next/dynamic"

const InterviewModeWrapper = dynamic(() => import("@/modules/interviews/components/interview-mode-wrapper").then(mod => mod.InterviewModeWrapper), {
  loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
})

const AnalysisTab = dynamic(() => import("@/modules/applications/components/analysis-tab").then(mod => mod.AnalysisTab), {
  loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
})

export default function ApplicationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params?.id as string | undefined

  const [application, setApplication] = useState<Application | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [pendingDocumentIds, setPendingDocumentIds] = useState<string[]>([])
  const [initialSelectedDocumentIds, setInitialSelectedDocumentIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState<string | "all" | null>(null)
  const [regenerateProgress, setRegenerateProgress] = useState<{ current: number; total: number } | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = useState<Application["status"] | null>(null)
  const [initialStatus, setInitialStatus] = useState<Application["status"] | null>(null)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  const [_isSavingChanges, setIsSavingChanges] = useState(false)
  const [jobDescriptionExpanded, setJobDescriptionExpanded] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showEditQuestionsModal, setShowEditQuestionsModal] = useState(false)
  const [showExtractConfirmModal, setShowExtractConfirmModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState(false)
  const [savingCoverLetter, setSavingCoverLetter] = useState(false)
  const [notes, setNotes] = useState<ApplicationNote[]>([])
  const [notesLoading] = useState(false)
  const [notesViewType, setNotesViewType] = useState<"card" | "timeline">("card")
  const [notesSortOrder, setNotesSortOrder] = useState<"newest" | "oldest">("newest")
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [editingNote, setEditingNote] = useState<ApplicationNote | null>(null)
  const [showNewInterviewModal, setShowNewInterviewModal] = useState(false)
  const [interviewSessions, setInterviewSessions] = useState<InterviewSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("questions")
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)
  const [viewingReportSessionId, setViewingReportSessionId] = useState<string | null>(null)
  const [reportData, setReportData] = useState<InterviewReportData | null>(null)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [pendingRegenerationTarget, setPendingRegenerationTarget] = useState<string | "all" | null>(null)
  const textareaRefs = new Map<string, HTMLTextAreaElement | null>()
  const coverLetterTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!id) return

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const [app, qs, docs, relatedDocIds, appNotes, sessions, appDocDetails] = await Promise.all([
          getApplication(id),
          getQuestionsByApplicationId(id),
          getDocuments(),
          getApplicationDocuments(id),
          getNotesByApplicationId(id),
          getInterviewSessions(id),
          getApplicationDocumentDetails(id),
        ])

        // Merge application-specific analysis into documents
        const docsWithAnalysis = docs.map(doc => {
          const details = appDocDetails.find((d) => d.document_id === doc.id)
          // Always return a new object to avoid mutating 'doc' if it is reused
          // Strictly use the application-specific details. If they don't exist,
          // explicitly set analysis fields to null/default to avoid showing legacy global analysis.
          return {
            ...doc,
            analysis_result: details?.analysis_result || null,
            analysis_status: details?.analysis_status || 'not_analyzed',
            summary_generated_at: details?.summary_generated_at || null
          }
        })

        setApplication(app)
        setQuestions(qs)
        setDocuments(docsWithAnalysis)
        setNotes(appNotes)
        setInterviewSessions(sessions)
        setPendingStatus(app.status)
        setInitialStatus(app.status)
        setPendingDocumentIds([])
        setInitialSelectedDocumentIds(relatedDocIds)
        setSelectedDocumentIds(relatedDocIds)
      } catch (err: unknown) {
        console.error("Error loading application detail:", err)
        setError("Unable to load this application. It may not exist or you may not have access.")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  // Load notes view preference and sort order from localStorage
  useEffect(() => {
    if (!id) return
    const savedViewType = localStorage.getItem(`notes-view-${id}`) as "card" | "timeline" | null
    const savedSortOrder = localStorage.getItem(`notes-sort-${id}`) as "newest" | "oldest" | null
    if (savedViewType) setNotesViewType(savedViewType)
    if (savedSortOrder) setNotesSortOrder(savedSortOrder)
  }, [id])

  // Handle URL parameters for tab and session selection
  useEffect(() => {
    const tab = searchParams?.get('tab')
    const session = searchParams?.get('session')

    if (tab) {
      setActiveTab(tab)
    }

    if (session) {
      setSelectedSessionId(session)
    }
  }, [searchParams])

  const handleRegenerate = async (questionId?: string) => {
    if (!application) return
    setPendingRegenerationTarget(questionId || "all")
    setShowRegenerateModal(true)
  }

  const handleConfirmRegeneration = async (extraContext?: string) => {
    if (!application || !pendingRegenerationTarget) return

    const questionId = pendingRegenerationTarget === "all" ? undefined : pendingRegenerationTarget

    try {
      setRegenerating(pendingRegenerationTarget)
      // Close modal immediately so we show the loading state on buttons
      setShowRegenerateModal(false)

      if (!questionId) {
        // Bulk regen: stream answers as they arrive
        setRegenerateProgress({ current: 0, total: 0 })

        const res = await fetch("/api/questions/regenerate/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: application.id, extraContext }),
        })

        if (!res.ok || !res.body) {
          setError("Failed to start streaming regeneration")
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const events = buffer.split("\n\n")
          buffer = events.pop() || ""

          for (const evt of events) {
            const trimmed = evt.trim()
            if (!trimmed) continue
            const lines = trimmed.split("\n")
            const eventLine = lines.find((l) => l.startsWith("event: "))
            const dataLine = lines.find((l) => l.startsWith("data: "))
            if (!eventLine || !dataLine) continue
            const name = eventLine.slice(7).trim()
            let data: unknown
            try {
              data = JSON.parse(dataLine.slice(6))
            } catch {
              continue
            }

            if (name === "start") {
              const startData = data as { total: number }
              setRegenerateProgress({ current: 0, total: startData.total })
            } else if (name === "answer") {
              const updated = data as Question
              setQuestions((prev) =>
                prev.map((q) => (q.id === updated.id ? updated : q))
              )
              setRegenerateProgress((p) =>
                p ? { ...p, current: p.current + 1 } : null
              )
            } else if (name === "error") {
              const errData = data as { questionId: string; message: string }
              console.error(
                "Question regen failed:",
                errData.questionId,
                errData.message
              )
              setRegenerateProgress((p) =>
                p ? { ...p, current: p.current + 1 } : null
              )
            } else if (name === "done") {
              const summary = data as { successCount: number; total: number }
              if (summary.successCount === 0 && summary.total > 0) {
                setError("Failed to regenerate any answers")
              }
            }
          }
        }
      } else {
        // Single question: keep existing non-streaming endpoint
        const response = await fetch("/api/questions/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId: application.id,
            questionId,
            extraContext,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          console.error("Error regenerating answer:", errorData.error)
          setError(errorData.error || "Failed to regenerate answers")
          return
        }

        const data = await response.json()
        if (data.questions && data.questions.length > 0) {
          setQuestions((prev) =>
            prev.map((q) => {
              const updated = data.questions.find(
                (uq: Question) => uq.id === q.id
              )
              return updated || q
            })
          )
        }
      }
    } catch (err) {
      console.error("Error regenerating answer:", err)
      setError("Failed to regenerate answers. Please try again.")
    } finally {
      setRegenerating(null)
      setPendingRegenerationTarget(null)
      setRegenerateProgress(null)
    }
  }

  const handleExtractQuestions = () => {
    if (!application || !application.url) {
      setError("No application URL found. Please add a URL to the application first.")
      return
    }

    setShowExtractConfirmModal(true)
  }

  const handleConfirmExtractQuestions = async () => {
    if (!application) return

    setExtracting(true)
    setError(null)
    setShowExtractConfirmModal(false)

    try {
      // Call the extract-from-url API
      const response = await fetch('/api/questions/extract-from-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: application.url }),
      })

      const data = await response.json()

      if (!response.ok || !data.questions || data.questions.length === 0) {
        setError(data.error || 'No questions could be extracted from the URL.')
        return
      }

      // Delete all existing questions
      await Promise.all(questions.map(q => deleteQuestion(q.id)))

      // Create new questions
      const newQuestions = await Promise.all(
        data.questions.map((questionText: string) =>
          createQuestion({
            application_id: application.id,
            question_text: questionText,
          })
        )
      )

      setQuestions(newQuestions)

      // Show success message
      setSuccessMessage(`Successfully extracted ${newQuestions.length} question(s)!`)
    } catch (err) {
      console.error('Error extracting questions:', err)
      setError('Failed to extract questions. Please try again.')
    } finally {
      setExtracting(false)
    }
  }

  const handleStatusChange = async (newStatus: Application["status"]) => {
    if (!application) return
    setIsSavingChanges(true)

    // Optimistic update
    setPendingStatus(newStatus)
    setApplication(prev => prev ? { ...prev, status: newStatus } : null)

    try {
      const previousStatus = application.status
      await updateApplication(application.id, { status: newStatus })

      // Send status update email notification
      try {
        await fetch('/api/notifications/send-status-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicationId: application.id,
            applicationTitle: application.title,
            previousStatus,
            newStatus: newStatus,
          }),
        })
      } catch (emailErr) {
        console.error('Failed to send status update email:', emailErr)
      }
    } catch (err) {
      console.error("Error saving status change:", err)
      // Revert on error
      setPendingStatus(application.status)
      setApplication(prev => prev ? { ...prev, status: application.status } : null)
      setError("Failed to update status")
    } finally {
      setIsSavingChanges(false)
    }
  }

  const toggleDocumentSelection = (docId: string) => {
    setPendingDocumentIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    )
  }

  const addSelectedDocuments = async () => {
    if (!application) return
    setIsSavingChanges(true)

    const newSelectedIds = [
      ...new Set([...selectedDocumentIds, ...pendingDocumentIds]),
    ]

    // Optimistic update
    setSelectedDocumentIds(newSelectedIds)
    setPendingDocumentIds([])
    setShowDocumentModal(false)

    try {
      await updateApplicationDocuments(application.id, newSelectedIds)
      setInitialSelectedDocumentIds(newSelectedIds)
    } catch (err) {
      console.error("Error saving documents:", err)
      // Revert logic would depend on complexity, for now just log
      setError("Failed to update documents")
    } finally {
      setIsSavingChanges(false)
    }
  }

  const removeDocument = async (docId: string) => {
    if (!application) return

    const newSelectedIds = selectedDocumentIds.filter((id) => id !== docId)

    // Optimistic update
    setSelectedDocumentIds(newSelectedIds)

    try {
      await updateApplicationDocuments(application.id, newSelectedIds)
      setInitialSelectedDocumentIds(newSelectedIds)
    } catch (err) {
      console.error("Error removing document:", err)
      setError("Failed to remove document")
      // Revert if needed
      setSelectedDocumentIds(selectedDocumentIds)
    }
  }

  const _hasChanges = () => {
    const statusChanged = pendingStatus !== initialStatus
    const documentsChanged = selectedDocumentIds.length !== initialSelectedDocumentIds.length ||
      !selectedDocumentIds.every(id => initialSelectedDocumentIds.includes(id))
    return statusChanged || documentsChanged
  }

  const _saveChanges = async () => {
    if (!application) return

    setIsSavingChanges(true)
    try {
      if (pendingStatus && pendingStatus !== application.status) {
        const previousStatus = application.status
        await updateApplication(application.id, { status: pendingStatus })
        setApplication((prev) => prev ? { ...prev, status: pendingStatus } : null)

        // Send status update email notification
        try {
          await fetch('/api/notifications/send-status-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              applicationId: application.id,
              applicationTitle: application.title,
              previousStatus,
              newStatus: pendingStatus,
            }),
          })
        } catch (emailErr) {
          console.error('Failed to send status update email:', emailErr)
          // Don't fail the save if email fails
        }
      }

      // Save document relationships if they changed
      if (selectedDocumentIds.length !== initialSelectedDocumentIds.length ||
        !selectedDocumentIds.every(id => initialSelectedDocumentIds.includes(id))) {
        await updateApplicationDocuments(application.id, selectedDocumentIds)
      }

      // Update initial states to reflect saved changes
      setInitialStatus(pendingStatus || application.status)
      setInitialSelectedDocumentIds(selectedDocumentIds)
      setPendingDocumentIds([])
    } catch (err) {
      console.error("Error saving changes:", err)
    } finally {
      setIsSavingChanges(false)
    }
  }

  const handleSaveManual = async (questionId: string, value: string) => {
    setSaving(questionId)
    try {
      const saved = await updateQuestion(questionId, { manual_answer: value })
      setQuestions((prev) => prev.map((q) => (q.id === saved.id ? saved : q)))
    } catch (err) {
      console.error("Error saving answer:", err)
    } finally {
      setSaving(null)
    }
  }

  const handleCopyAIAnswer = async (questionId: string, aiAnswer: string) => {
    // Save the AI answer as manual answer
    await handleSaveManual(questionId, aiAnswer)

    // Update the textarea visual
    const textarea = textareaRefs.get(questionId)
    if (textarea) {
      textarea.value = aiAnswer
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    if (!id) return
    try {
      await deleteInterviewSession(sessionId)
      // Reload sessions
      const sessions = await getInterviewSessions(id)
      setInterviewSessions(sessions)
      setShowDeleteConfirmModal(false)
      setDeletingSessionId(null)
      setSuccessMessage('Interview session deleted successfully')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error('Error deleting session:', err)
      setError('Failed to delete interview session')
    }
  }

  const handleGenerateCoverLetter = async () => {
    if (!application) return

    setGeneratingCoverLetter(true)
    setError(null)

    try {
      const response = await fetch("/api/cover-letter/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicationId: application.id,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("Error generating cover letter:", errorData.error)
        setError(errorData.error || "Failed to generate cover letter")
        return
      }

      const data = await response.json()
      if (data.coverLetter) {
        setApplication((prev) => prev ? { ...prev, ai_cover_letter: data.coverLetter } : null)
      }
    } catch (err) {
      console.error("Error generating cover letter:", err)
      setError("Failed to generate cover letter. Please try again.")
    } finally {
      setGeneratingCoverLetter(false)
    }
  }

  const handleSaveManualCoverLetter = async (value: string) => {
    if (!application) return

    setSavingCoverLetter(true)
    try {
      await updateApplication(application.id, { manual_cover_letter: value })
      setApplication((prev) => prev ? { ...prev, manual_cover_letter: value } : null)
    } catch (err) {
      console.error("Error saving cover letter:", err)
    } finally {
      setSavingCoverLetter(false)
    }
  }

  const handleCopyAICoverLetter = async (aiCoverLetter: string) => {
    // Save the AI cover letter as manual cover letter
    await handleSaveManualCoverLetter(aiCoverLetter)

    // Update the textarea visual
    const textarea = coverLetterTextareaRef.current
    if (textarea) {
      textarea.value = aiCoverLetter
    }
  }

  const handleSaveNote = async (noteData: {
    content: string
    category?: string
    is_pinned: boolean
  }) => {
    if (!application) return

    try {
      if (editingNote) {
        const updated = await updateNote(editingNote.id, noteData)
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
      } else {
        const newNote = await createNote(application.id, noteData)
        setNotes((prev) => [newNote, ...prev])
      }
      setEditingNote(null)
      setShowNoteModal(false)
    } catch (err) {
      console.error("Error saving note:", err)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId)
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
    } catch (err) {
      console.error("Error deleting note:", err)
    }
  }

  const handleTogglePinNote = async (noteId: string, isPinned: boolean) => {
    try {
      const updated = await togglePinNote(noteId, isPinned)
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
    } catch (err) {
      console.error("Error toggling pin:", err)
    }
  }

  const handleEditNote = (note: ApplicationNote) => {
    setEditingNote(note)
    setShowNoteModal(true)
  }

  const handleNewNote = () => {
    setEditingNote(null)
    setShowNoteModal(true)
  }

  const handleViewReport = (sessionId: string) => {
    setSelectedSessionId(sessionId)
  }

  const handleDeleteInterview = async () => {
    if (!sessionToDelete) return

    setDeletingSessionId(sessionToDelete)
    try {
      await deleteInterviewSession(sessionToDelete)
      setInterviewSessions((prev) => prev.filter((s) => s.id !== sessionToDelete))
      setSessionToDelete(null)
    } catch (err) {
      console.error("Error deleting interview:", err)
      setError("Failed to delete interview. Please try again.")
    } finally {
      setDeletingSessionId(null)
    }
  }


  if (!id) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Invalid application id.</p>
        </div>
      </DashboardLayout>
    )
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !application) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <p className="text-destructive text-sm">
            {error || "Application not found."}
          </p>
          <Button variant="outline" onClick={() => router.push("/applications")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Applications
          </Button>
        </div>
      </DashboardLayout>
    )
  }

  const statusLabel: Record<Application["status"], string> = {
    draft: "Draft",
    submitted: "Submitted",
    in_review: "In Review",
    interview: "Interview",
    offer: "Offer",
    rejected: "Rejected",
  }

  const priorityColor: Record<Application["priority"], string> = {
    low: "bg-primary",
    medium: "bg-yellow-500",
    high: "bg-destructive",
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex items-start gap-2 sm:gap-4">
            <Link href="/applications">
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 mt-1">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold break-words">{application.title}</h1>
              {application.url ? (
                <a
                  href={application.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm:text-sm text-primary hover:underline flex items-center gap-1 mt-1 break-all"
                >
                  <span className="truncate">{application.url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <div className="h-5 mt-1" />
              )}
            </div>
          </div>
        </div>

        {/* Application Info (Static) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Application Information</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowEditModal(true)} className="h-8 w-8 text-muted-foreground hover:text-primary">
              <Edit className="h-4 w-4" />
              <span className="sr-only">Edit Application</span>
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              {application.company && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Company/University</p>
                  <div className="h-[38px] flex items-center">
                    <span className="text-sm font-medium truncate">
                      {application.company}
                    </span>
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground mb-1">Status</p>
                <div className="relative inline-block w-full">
                  <button
                    onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                    className="w-full h-[38px] flex items-center justify-between px-3 py-2 rounded-md border border-input hover:bg-muted transition-colors text-sm font-medium"
                  >
                    <span className="capitalize">
                      {statusLabel[pendingStatus || application.status]}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {statusDropdownOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-input rounded-md shadow-md">
                      {(Object.keys(statusLabel) as Array<keyof typeof statusLabel>).map((status) => (
                        <button
                          key={status}
                          onClick={() => {
                            handleStatusChange(status)
                            setStatusDropdownOpen(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-muted ${pendingStatus === status ? "bg-muted font-medium" : ""
                            }`}
                        >
                          {statusLabel[status]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Priority</p>
                <div className="h-[38px] flex items-center space-x-2">
                  <div className={`h-2 w-2 rounded-full ${priorityColor[application.priority]}`} />
                  <span className="text-sm font-medium capitalize">
                    {application.priority}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Deadline</p>
                <div className="h-[38px] flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {application.deadline
                      ? new Date(application.deadline).toLocaleDateString()
                      : "No deadline"}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Type</p>
                <div className="h-[38px] flex items-center">
                  <Badge variant="outline" className="capitalize">
                    {application.type}
                  </Badge>
                </div>
              </div>
            </div>


            {application.job_description && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">
                  {application.type === 'scholarship' ? 'Scholarship Details' : 'Job Description'}
                </p>
                <motion.div
                  animate={{ height: "auto" }}
                  transition={{ duration: 0.3 }}
                >
                  <div
                    className={`text-sm whitespace-pre-wrap text-muted-foreground bg-muted/30 p-3 rounded border border-input transition-all ${jobDescriptionExpanded ? "" : "line-clamp-3"
                      }`}
                  >
                    {application.job_description}
                  </div>
                </motion.div>
                {application.job_description.split("\n").length > 3 && (
                  <button
                    onClick={() => setJobDescriptionExpanded(!jobDescriptionExpanded)}
                    className="mt-2 text-xs text-primary hover:underline transition-colors"
                  >
                    {jobDescriptionExpanded ? "Show Less" : "Show More"}
                  </button>
                )}
              </div>
            )}

            {/* Related Documents */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Related Documents</p>
              <p className="text-xs text-muted-foreground mb-4">
                Select documents to use as context for generating AI answers to application questions.
              </p>

              {/* Add Document Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPendingDocumentIds([])
                  setShowDocumentModal(true)
                }}
                className="mb-4"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Document
              </Button>

              {/* Selected Documents List */}
              {selectedDocumentIds.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No documents selected yet. Click &quot;Add Document&quot; to select documents.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {selectedDocumentIds.map((docId) => {
                    const doc = documents.find((d) => d.id === docId)
                    if (!doc) return null
                    return (
                      <div
                        key={doc.id}
                        className="rounded-lg border p-3 flex items-center gap-3 transition-all hover:bg-muted relative group border-input bg-card"
                      >
                        <div className="p-2 rounded bg-background border flex items-center justify-center">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="overflow-hidden flex-1">
                          <p className="text-sm font-medium truncate">{doc.file_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {((doc.file_size || 0) / 1024).toFixed(0)} KB • {doc.analysis_status === "success" ? "Analyzed" : "Pending"}
                          </p>
                        </div>
                        <button
                          onClick={() => removeDocument(doc.id)}
                          className="p-1 hover:bg-destructive/10 hover:text-destructive rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 absolute top-1 right-1"
                          title="Remove document"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Document Selection Modal */}
              {showDocumentModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                  <Card className="w-full max-w-md mx-4">
                    <CardHeader>
                      <CardTitle>Select Documents</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {documents.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No documents available. Upload documents in the Documents section first.
                        </p>
                      ) : (
                        <>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {documents.map((doc) => (
                              <button
                                key={doc.id}
                                onClick={() => toggleDocumentSelection(doc.id)}
                                className={`w-full text-left p-3 rounded border transition-all ${pendingDocumentIds.includes(doc.id)
                                  ? "border-primary bg-primary/10"
                                  : "border-input hover:border-primary/50 hover:bg-muted/50"
                                  }`}
                              >
                                <p className="text-sm font-medium truncate">{doc.file_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {doc.analysis_status === "success"
                                    ? "✓ Analyzed"
                                    : doc.analysis_status === "pending"
                                      ? "⏳ Analyzing..."
                                      : "✗ Not analyzed"}
                                </p>
                              </button>
                            ))}
                          </div>
                          <div className="flex space-x-2 pt-4 border-t">
                            <Button
                              variant="outline"
                              onClick={() => setShowDocumentModal(false)}
                              className="flex-1"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={addSelectedDocuments}
                              disabled={pendingDocumentIds.length === 0}
                              className="flex-1"
                            >
                              Add Selected
                            </Button>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-center mb-6">
            <TabsList className="grid grid-cols-6 w-full sm:w-auto">
              <TabsTrigger
                value="questions"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Questions
              </TabsTrigger>
              <TabsTrigger
                value="cover-letter"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Cover Letter
              </TabsTrigger>
              <TabsTrigger
                value="analysis"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Analysis
              </TabsTrigger>
              <TabsTrigger
                value="job-fit"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Job Fit
              </TabsTrigger>
              <TabsTrigger
                value="notes"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Notes
              </TabsTrigger>
              <TabsTrigger
                value="interview"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Interview
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Questions Tab */}
          <TabsContent value="questions" className="space-y-6 mt-0">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <MessageSquareText className="h-6 w-6 text-foreground dark:text-primary" />
                  Application Questions
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExtractQuestions}
                    disabled={extracting || regenerating !== null || !application.url}
                    title={!application.url ? "Add a URL to the application first" : "Extract questions from the application URL"}
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Extracting...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Extract Questions
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEditQuestionsModal(true)}
                    disabled={regenerating !== null || extracting}
                    title="Edit, delete, or add new questions"
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Questions
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRegenerate()}
                    disabled={regenerating !== null || questions.length === 0}
                  >
                    {regenerating === "all" ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        {regenerateProgress && regenerateProgress.total > 0
                          ? `Generating ${regenerateProgress.current}/${regenerateProgress.total}...`
                          : "Generating..."}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate All
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No questions found for this application yet. {application.url ? "Click 'Extract Questions' above to automatically extract questions from the application URL, or" : "You can"} add questions when creating or editing the application.
                </p>
              ) : (
                questions.map((question, index) => (
                  <motion.div
                    key={question.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <Card>
                      <CardHeader className="p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base sm:text-lg">
                              Question {index + 1}
                            </CardTitle>
                            <CardDescription className="text-sm sm:text-base font-medium text-foreground break-words">
                              {question.question_text}
                            </CardDescription>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRegenerate(question.id)}
                            disabled={regenerating === question.id || regenerating === "all"}
                            className="shrink-0 text-xs sm:text-sm self-end sm:self-start"
                          >
                            {regenerating === question.id ? (
                              <>
                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                {question.ai_answer ? "Regenerating" : "Generating"}
                              </>
                            ) : (
                              <>
                                <RotateCw className="mr-1.5 h-3 w-3" />
                                {question.ai_answer ? "Regenerate" : "Generate"}
                              </>
                            )}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <p className="text-sm font-medium">AI-Generated Answer</p>
                          </div>
                          <Textarea
                            value={question.ai_answer || ""}
                            rows={5}
                            className="resize-none"
                            readOnly
                            placeholder="No AI-generated answer yet."
                          />
                        </div>

                        {question.ai_answer && (
                          <div className="flex justify-center">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleCopyAIAnswer(question.id, question.ai_answer || "")}
                              disabled={saving === question.id}
                              className="glow-effect hover:bg-primary group"
                              title="Copy AI answer to your edited answer"
                            >
                              <Copy className="h-4 w-4 text-primary group-hover:text-background" />
                            </Button>
                          </div>
                        )}

                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Your edited answer (saved privately for this application)
                          </p>
                          <Textarea
                            ref={(el) => {
                              if (el) textareaRefs.set(question.id, el)
                            }}
                            defaultValue={question.manual_answer || ""}
                            rows={4}
                            onBlur={(e) =>
                              e.target.value !== (question.manual_answer || "")
                                ? handleSaveManual(question.id, e.target.value)
                                : undefined
                            }
                            disabled={saving === question.id}
                          />
                          {saving === question.id && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Saving...
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>

          {/* Cover Letter Tab */}
          <TabsContent value="cover-letter" className="space-y-6 mt-0">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <Mail className="h-6 w-6 text-foreground dark:text-primary" />
                  Cover Letter
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateCoverLetter}
                  disabled={generatingCoverLetter}
                >
                  {generatingCoverLetter ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Cover Letter
                    </>
                  )}
                </Button>
              </div>

              {application?.ai_cover_letter && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card>
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="text-base sm:text-lg">Generated Cover Letter</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
                        {/* AI-Generated Cover Letter */}
                        <div className="flex-1 flex flex-col">
                          <div className="flex items-center space-x-2 mb-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <p className="text-sm font-medium">AI-Generated Cover Letter</p>
                          </div>
                          <Textarea
                            value={application.ai_cover_letter || ""}
                            className="resize-none flex-1 min-h-[400px]"
                            readOnly
                            placeholder="No AI-generated cover letter yet."
                          />
                        </div>

                        {/* Copy Button */}
                        <div className="flex items-center justify-center lg:flex-col gap-2 lg:gap-0">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleCopyAICoverLetter(application.ai_cover_letter || "")}
                            disabled={savingCoverLetter}
                            className="glow-effect hover:bg-primary group"
                            title="Copy AI cover letter to your edited cover letter"
                          >
                            <Copy className="h-4 w-4 text-primary group-hover:text-background" />
                          </Button>
                        </div>

                        {/* Your Edited Cover Letter */}
                        <div className="flex-1 flex flex-col">
                          <p className="text-xs text-muted-foreground mb-2">
                            Your edited cover letter (saved privately for this application)
                          </p>
                          <Textarea
                            ref={coverLetterTextareaRef}
                            defaultValue={application.manual_cover_letter || ""}
                            className="resize-none flex-1 min-h-[400px]"
                            onBlur={(e) =>
                              e.target.value !== (application.manual_cover_letter || "")
                                ? handleSaveManualCoverLetter(e.target.value)
                                : undefined
                            }
                            disabled={savingCoverLetter}
                          />
                          {savingCoverLetter && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Saving...
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </div>
          </TabsContent>

          {/* Analysis Tab */}
          <TabsContent value="analysis" className="mt-6">
            <AnalysisTab
              application={application}
              documents={documents.filter(d => selectedDocumentIds.includes(d.id))}
            />
          </TabsContent>

          {/* Job Fit Tab */}
          <TabsContent value="job-fit" className="mt-6">
            <JobFitCard
              jobDescription={application.job_description}
              documentId={selectedDocumentIds[0]}
            />
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="space-y-6 mt-0">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <StickyNote className="h-6 w-6 text-foreground dark:text-primary" />
                  Notes
                </h2>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1 border border-input rounded-lg p-1">
                    <Button
                      variant={notesViewType === "card" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => {
                        setNotesViewType("card")
                        localStorage.setItem(`notes-view-${id}`, "card")
                      }}
                      className="text-xs"
                    >
                      Card View
                    </Button>
                    <Button
                      variant={notesViewType === "timeline" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => {
                        setNotesViewType("timeline")
                        localStorage.setItem(`notes-view-${id}`, "timeline")
                      }}
                      className="text-xs"
                    >
                      Timeline
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const newOrder = notesSortOrder === "newest" ? "oldest" : "newest"
                      setNotesSortOrder(newOrder)
                      localStorage.setItem(`notes-sort-${id}`, newOrder)
                    }}
                    title={`Currently: ${notesSortOrder === "newest" ? "Newest First" : "Oldest First"}`}
                  >
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    {notesSortOrder === "newest" ? "Newest" : "Oldest"}
                  </Button>
                  <Button
                    onClick={handleNewNote}
                    className="glow-effect flex-1 sm:flex-none"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Note
                  </Button>
                </div>
              </div>

              {notesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (() => {
                // Sort notes based on notesSortOrder
                const sortedNotes = [...notes].sort((a, b) => {
                  // Keep pinned notes first
                  if (a.is_pinned !== b.is_pinned) {
                    return a.is_pinned ? -1 : 1
                  }
                  // Then sort by date
                  const dateA = new Date(a.created_at).getTime()
                  const dateB = new Date(b.created_at).getTime()
                  return notesSortOrder === "newest" ? dateB - dateA : dateA - dateB
                })

                return notesViewType === "card" ? (
                  <NotesCardView
                    notes={sortedNotes}
                    onEdit={handleEditNote}
                    onDelete={handleDeleteNote}
                    onTogglePin={handleTogglePinNote}
                  />
                ) : (
                  <NotesTimelineView
                    notes={sortedNotes}
                    onEdit={handleEditNote}
                    onDelete={handleDeleteNote}
                    onTogglePin={handleTogglePinNote}
                  />
                )
              })()}
            </div>
          </TabsContent>

          {/* Interview Tab */}
          <TabsContent value="interview" className="mt-0">
            <div>
              {selectedSessionId ? (
                // Show session detail when a session is selected
                <InterviewModeWrapper
                  sessionId={selectedSessionId}
                  onComplete={async () => {
                    // Reload sessions to update completion status
                    try {
                      const sessions = await getInterviewSessions(id!)
                      setInterviewSessions(sessions)
                      setSelectedSessionId(null) // Go back to list
                    } catch (err) {
                      console.error('Error reloading sessions:', err)
                    }
                  }}
                  onBack={() => setSelectedSessionId(null)}
                />
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                      <Mic className="h-6 w-6 text-foreground dark:text-primary" />
                      Mock Interview
                    </h2>
                    <Button
                      className="glow-effect flex-1 sm:flex-none"
                      onClick={() => setShowNewInterviewModal(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New Interview
                    </Button>
                  </div>

                  {interviewSessions.length === 0 ? (
                    // Empty state when no sessions
                    <Card className="border-2">
                      <CardContent className="pt-6">
                        <div className="text-center py-12">
                          <Mic className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                          <h3 className="text-lg font-semibold mb-2">AI-Powered Interview Practice</h3>
                          <p className="text-muted-foreground max-w-md mx-auto mb-6">
                            Practice your interview skills with AI-generated questions tailored to your application.
                            Get real-time feedback and improve your responses.
                          </p>
                          <Button
                            className="glow-effect"
                            onClick={() => setShowNewInterviewModal(true)}
                          >
                            <Plus className="h-5 w-5 mr-2" />
                            Start Your First Interview
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    // Session list when sessions exist
                    <div className="grid grid-cols-1 gap-4">
                      {interviewSessions.map((session) => {
                        const sessionTypeLabels: Record<string, string> = {
                          behavioral: "Behavioral",
                          technical: "Technical",
                          mixed: "Mixed",
                          resume_grill: "Resume Grill",
                          company_specific: "Company-Specific"
                        }

                        const difficultyColors = {
                          easy: "bg-green-500/10 text-green-700 dark:text-green-400",
                          medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
                          hard: "bg-red-500/10 text-red-700 dark:text-red-400"
                        }

                        const progress = session.total_questions > 0
                          ? (session.answered_questions / session.total_questions) * 100
                          : 0

                        const avgScore = session.average_score || 0

                        return (
                          <motion.div
                            key={session.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            whileHover={{ scale: 1.01 }}
                          >
                            <Card
                              className="group cursor-pointer hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 relative overflow-hidden bg-card/50 backdrop-blur-sm"
                              onClick={() => setSelectedSessionId(session.id)}
                            >
                              {/* Gradient overlay on hover */}
                              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                      <CardTitle className="text-lg font-bold">
                                        {sessionTypeLabels[session.session_type] || session.session_type}
                                      </CardTitle>
                                      {session.company_name && (
                                        <Badge variant="outline" className="text-xs font-medium">
                                          {session.company_name}
                                        </Badge>
                                      )}
                                    </div>
                                    <CardDescription className="text-xs flex items-center gap-2">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(session.created_at).toLocaleDateString()} at{' '}
                                      {new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </CardDescription>
                                  </div>
                                  <div className="flex flex-col gap-2 items-end shrink-0">
                                    <div className="flex items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className={`capitalize font-semibold ${session.difficulty ? difficultyColors[session.difficulty] : ''}`}
                                      >
                                        {session.difficulty || 'medium'}
                                      </Badge>
                                      {(session.status === 'completed' || progress === 100) && (
                                        <Badge className="bg-green-600 text-white border-0 shadow-sm">
                                          ✓ Completed
                                        </Badge>
                                      )}
                                    </div>
                                    {session.answered_questions > 0 && (
                                      <div className="flex items-center gap-1.5">
                                        <div className={`flex items-center justify-center h-7 w-7 rounded-full ${avgScore >= 8 ? 'bg-green-500/10 border border-green-500/30' :
                                          avgScore >= 6 ? 'bg-yellow-500/10 border border-yellow-500/30' :
                                            'bg-red-500/10 border border-red-500/30'
                                          }`}>
                                          <span className={`text-xs font-bold ${avgScore >= 8 ? 'text-green-600 dark:text-green-400' :
                                            avgScore >= 6 ? 'text-yellow-600 dark:text-yellow-400' :
                                              'text-red-600 dark:text-red-400'
                                            }`}>
                                            {avgScore.toFixed(1)}
                                          </span>
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium">Avg Score</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardHeader>

                              <CardContent className="space-y-4 pb-4">
                                {/* Progress Section */}
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground font-medium">Progress</span>
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-foreground">
                                        {session.answered_questions} / {session.total_questions}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        ({Math.round(progress)}%)
                                      </span>
                                    </div>
                                  </div>
                                  <div className="relative h-2.5 w-full bg-secondary/50 rounded-full overflow-hidden border border-border/50">
                                    <div
                                      className="h-full bg-gradient-to-r from-primary via-primary to-primary/80 transition-all duration-500 ease-out relative"
                                      style={{ width: `${progress}%` }}
                                    >
                                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                                    </div>
                                  </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2 pt-2">
                                  {(session.status === 'completed' || progress === 100) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 text-primary border-primary/50 hover:bg-primary hover:text-primary-foreground glow-effect group/btn transition-all"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleViewReport(session.id)
                                      }}
                                    >
                                      <FileText className="h-4 w-4 mr-2 group-hover/btn:scale-110 transition-transform" />
                                      View Report
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={`text-red-600 border-red-600/50 hover:bg-red-600 hover:text-white transition-all ${!(session.status === 'completed' || progress === 100) ? 'flex-1' : ''
                                      }`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSessionToDelete(session.id)
                                    }}
                                    disabled={deletingSessionId === session.id}
                                  >
                                    {deletingSessionId === session.id ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Deleting...
                                      </>
                                    ) : (
                                      <>
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>

      </div>

      {/* Note Modal */}
      <NoteModal
        isOpen={showNoteModal}
        onClose={() => {
          setShowNoteModal(false)
          setEditingNote(null)
        }}
        onSave={handleSaveNote}
        initialNote={
          editingNote
            ? {
              content: editingNote!.content,
              category: editingNote!.category,
              is_pinned: editingNote!.is_pinned,
            }
            : undefined
        }
      />

      {/* New Interview Modal */}
      <NewInterviewModal
        isOpen={showNewInterviewModal}
        onClose={() => setShowNewInterviewModal(false)}
        onSuccess={async (sessionId) => {
          setShowNewInterviewModal(false)
          setSuccessMessage('Interview session created! Start practicing now.')
          // Switch to interview tab
          setActiveTab('interview')
          // Reload sessions and select the new one
          try {
            const sessions = await getInterviewSessions(id!)
            setInterviewSessions(sessions)
            setSelectedSessionId(sessionId)
          } catch (err) {
            console.error('Error reloading sessions:', err)
          }
        }}
        applicationId={id!}
        documents={documents}
        companyName={application?.company || undefined}
      />

      {/* Edit Application Modal */}
      <EditApplicationModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={() => {
          setShowEditModal(false)
          // Reload application data
          const load = async () => {
            try {
              const app = await getApplication(id!)
              setApplication(app)
            } catch (err) {
              console.error("Error reloading application:", err)
            }
          }
          void load()
        }}
        application={application}
      />

      {/* Edit Questions Modal */}
      <EditQuestionsModal
        isOpen={showEditQuestionsModal}
        onClose={() => setShowEditQuestionsModal(false)}
        onSuccess={() => {
          // Reload questions data
          const load = async () => {
            try {
              const qs = await getQuestionsByApplicationId(id!)
              setQuestions(qs)
            } catch (err) {
              console.error("Error reloading questions:", err)
            }
          }
          void load()
        }}
        questions={questions}
        applicationId={application?.id || ""}
      />

      {/* Extract Questions Confirmation Modal */}
      <ConfirmModal
        isOpen={showExtractConfirmModal}
        title="Extract Questions?"
        description="This will replace all existing questions with newly extracted ones from the URL. Continue?"
        confirmText="Extract"
        cancelText="Cancel"
        onConfirm={handleConfirmExtractQuestions}
        onCancel={() => setShowExtractConfirmModal(false)}
        isLoading={extracting}
      />

      {/* Delete Interview Session Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirmModal}
        title="Delete Interview Session?"
        description="This will permanently delete this interview session and all associated questions and answers. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={async () => {
          if (deletingSessionId) {
            await handleDeleteSession(deletingSessionId)
          }
        }}
        onCancel={() => {
          setShowDeleteConfirmModal(false)
          setDeletingSessionId(null)
        }}
        isLoading={false}
      />

      {/* Interview Report Modal */}
      <InterviewReportModal
        isOpen={!!viewingReportSessionId}
        onClose={() => {
          setViewingReportSessionId(null)
          setReportData(null)
        }}
        reportData={reportData}
        sessionId={viewingReportSessionId || ''}
      />

      {/* Success Message Modal */}
      <AlertModal
        isOpen={!!successMessage}
        title="Success"
        message={successMessage || ""}
        type="success"
        onClose={() => setSuccessMessage(null)}
      />

      {/* Delete Interview Confirmation Modal */}
      <ConfirmModal
        isOpen={!!sessionToDelete}
        title="Delete Interview Session?"
        description="This will permanently delete this interview session and all associated questions and answers. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteInterview}
        onCancel={() => setSessionToDelete(null)}
        isLoading={!!deletingSessionId}
      />

      {/* Regenerate Context Modal */}
      <RegenerateContextModal
        isOpen={showRegenerateModal}
        onClose={() => {
          setShowRegenerateModal(false)
          setPendingRegenerationTarget(null)
        }}
        onConfirm={handleConfirmRegeneration}
        isRegeneratingAll={pendingRegenerationTarget === "all"}
        isLoading={regenerating !== null} // Wait, actually we close modal before regenerating, so this might not be needed for loading state HERE, but good for safety
      />
    </DashboardLayout >
  )
}
