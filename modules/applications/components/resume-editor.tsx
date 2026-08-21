"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useEditor } from "@tiptap/react"
import type { JSONContent } from "@tiptap/react"
import { Button } from "@/shared/ui/button"
import {
    ArrowLeft,
    Download,
    Save,
    History,
    Loader2,
    Sparkles,
    Wand2,
    Trash2,
    ChevronDown,
    FileText,
    FileType2,
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/shared/ui/select"
import { useToast } from "@/shared/ui/use-toast"
import { useDebounceCallback } from "usehooks-ts"
import { type ResumeAnalysisResult } from "./resume-feedback"
import type { ParsedDocument } from "@/shared/infrastructure/ai"
import {
    resumeVersionsService,
    type ResumeVersion,
    type SourceFormat,
} from "@/lib/services/resume-versions"
import { buildExtensions } from "./editor/extensions"
import { blocksToTipTap, emptyDoc } from "./editor/blocks-to-tiptap"
import { renderTemplate } from "./editor/templates/registry"
import type { TemplateId, EditorBlock, ResumeDoc, DocSettings } from "./editor/types"
import { DEFAULT_DOC_SETTINGS } from "./editor/types"
import { EditorToolbar } from "./editor/toolbar"
import { DiffModal } from "./editor/diff-modal"

// Re-export legacy types so existing imports keep working until callers migrate.
export type { EditorBlock, BlockType, BlockStyles } from "./editor/types"

interface ResumeEditorProps {
    documentUrl: string
    analysis: ResumeAnalysisResult | null
    parsedData: ParsedDocument | null
    extractedText: string | null
    applicationId: string
    documentId: string
    onBack: () => void
    fileName: string
}

const detectSourceFormat = (fileName: string): SourceFormat => {
    const ext = fileName.toLowerCase().split('.').pop()
    if (ext === 'docx' || ext === 'doc') return 'docx'
    if (ext === 'txt') return 'txt'
    if (ext === 'json') return 'json'
    return 'pdf'
}

export function ResumeEditor({
    analysis,
    extractedText,
    applicationId,
    documentId,
    onBack,
    fileName,
}: ResumeEditorProps) {
    const { toast } = useToast()
    const [versions, setVersions] = useState<ResumeVersion[]>([])
    const [currentVersionId, setCurrentVersionId] = useState<string | null>(null)
    const [templateId, setTemplateId] = useState<TemplateId>('modern')
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [isRewriting, setIsRewriting] = useState(false)
    const [diffOpen, setDiffOpen] = useState(false)
    const [diffOriginal, setDiffOriginal] = useState<ResumeDoc | null>(null)
    const [diffProposed, setDiffProposed] = useState<ResumeDoc | null>(null)
    const [diffLoading, setDiffLoading] = useState(false)
    const [selectionEmpty, setSelectionEmpty] = useState(true)
    const [docSettings, setDocSettings] = useState<DocSettings>(DEFAULT_DOC_SETTINGS)

    const sourceFormat = useMemo(() => detectSourceFormat(fileName), [fileName])

    const settingsStorageKey = useMemo(
        () => `resume-doc-settings:${documentId}:${applicationId}`,
        [documentId, applicationId],
    )

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const raw = window.localStorage.getItem(settingsStorageKey)
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<DocSettings>
                setDocSettings({
                    marginTopMm: parsed.marginTopMm ?? DEFAULT_DOC_SETTINGS.marginTopMm,
                    marginRightMm: parsed.marginRightMm ?? DEFAULT_DOC_SETTINGS.marginRightMm,
                    marginBottomMm: parsed.marginBottomMm ?? DEFAULT_DOC_SETTINGS.marginBottomMm,
                    marginLeftMm: parsed.marginLeftMm ?? DEFAULT_DOC_SETTINGS.marginLeftMm,
                })
            }
        } catch {
            // ignore corrupt storage
        }
    }, [settingsStorageKey])

    const updateDocSettings = useCallback((next: Partial<DocSettings>) => {
        setDocSettings(prev => {
            const merged = { ...prev, ...next }
            if (typeof window !== 'undefined') {
                try {
                    window.localStorage.setItem(settingsStorageKey, JSON.stringify(merged))
                } catch {
                    // ignore quota errors
                }
            }
            return merged
        })
    }, [settingsStorageKey])

    const editor = useEditor({
        extensions: buildExtensions(),
        content: emptyDoc(),
        immediatelyRender: false,
        editorProps: {
            attributes: {
                spellcheck: 'true',
                class: 'focus:outline-none',
            },
        },
    })

    const debouncedSave = useDebounceCallback(async (doc: JSONContent) => {
        if (!currentVersionId) return
        setIsSaving(true)
        try {
            const version = versions.find(v => v.id === currentVersionId)
            if (!version) return
            const saved = await resumeVersionsService.saveVersion({
                id: version.id,
                document_id: documentId,
                application_id: applicationId,
                version_name: version.version_name,
                content_json: doc,
                template_id: templateId,
                source_format: sourceFormat,
                parent_document_id: documentId,
            })
            setVersions(prev => prev.map(v => v.id === saved.id ? saved : v))
        } catch (err) {
            console.error("Auto-save error:", err)
        } finally {
            setIsSaving(false)
        }
    }, 1500)

    useEffect(() => {
        if (!editor) return
        const handler = () => {
            debouncedSave(editor.getJSON())
        }
        const selectionHandler = () => {
            setSelectionEmpty(editor.state.selection.empty)
        }
        editor.on('update', handler)
        editor.on('selectionUpdate', selectionHandler)
        editor.on('transaction', selectionHandler)
        return () => {
            editor.off('update', handler)
            editor.off('selectionUpdate', selectionHandler)
            editor.off('transaction', selectionHandler)
        }
    }, [editor, debouncedSave])

    useEffect(() => {
        const load = async () => {
            try {
                const fetched = await resumeVersionsService.getVersions(documentId)
                const appScoped = fetched.filter(v => v.application_id === applicationId)
                setVersions(appScoped)

                let initialDoc: ResumeDoc = emptyDoc()
                let initialTemplate: TemplateId = 'modern'
                let initialVersionId: string | null = null
                let needsExtraction = false

                const docFromVersion = (v: typeof fetched[number]): ResumeDoc | null => {
                    if (v.content_json) return v.content_json as ResumeDoc
                    if (v.blocks && Array.isArray(v.blocks) && v.blocks.length > 0) {
                        return blocksToTipTap(v.blocks as EditorBlock[])
                    }
                    return null
                }

                if (appScoped.length > 0) {
                    const latest = appScoped[0]
                    initialVersionId = latest.id
                    initialTemplate = latest.template_id ?? 'modern'
                    const doc = docFromVersion(latest)
                    if (doc) initialDoc = doc
                } else if (fetched.length > 0) {
                    // Reuse any prior version's content (e.g., from another application
                    // using the same document) so extraction runs once per document.
                    const reusable = fetched.find(v => docFromVersion(v) !== null) ?? fetched[0]
                    const doc = docFromVersion(reusable)
                    if (doc) initialDoc = doc
                    initialTemplate = reusable.template_id ?? 'modern'
                } else {
                    needsExtraction = true
                    if (sourceFormat === 'pdf') {
                        try {
                            const layoutRes = await fetch('/api/editor/detect-layout', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ documentId }),
                            })
                            if (layoutRes.ok) {
                                const { layout } = await layoutRes.json()
                                if (layout?.suggestedTemplate) {
                                    initialTemplate = layout.suggestedTemplate
                                }
                            }
                        } catch (err) {
                            console.warn("Layout detection failed:", err)
                        }
                    }
                }

                if (needsExtraction && sourceFormat === 'docx') {
                    try {
                        const res = await fetch('/api/editor/import-docx', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ documentId }),
                        })
                        if (res.ok) {
                            const data = await res.json()
                            if (data.contentJson) {
                                initialDoc = data.contentJson as ResumeDoc
                            }
                        } else {
                            console.warn("DOCX import failed:", res.status)
                        }
                    } catch (err) {
                        console.warn("DOCX import error, falling back to text parse:", err)
                    }
                } else if (needsExtraction && extractedText && extractedText.trim().length > 50) {
                    try {
                        const res = await fetch('/api/editor/parse-text', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ extractedText }),
                        })
                        if (res.ok) {
                            const data = await res.json()
                            if (data.blocks && Array.isArray(data.blocks)) {
                                initialDoc = blocksToTipTap(data.blocks as EditorBlock[])
                            }
                        }
                    } catch (err) {
                        console.warn("AI parse failed, falling back to plain text:", err)
                    }
                }

                if (editor) {
                    editor.commands.setContent(initialDoc)
                }
                setTemplateId(initialTemplate)

                if (!initialVersionId) {
                    const created = await resumeVersionsService.saveVersion({
                        document_id: documentId,
                        application_id: applicationId,
                        version_name: 'Version 1',
                        content_json: editor ? editor.getJSON() : initialDoc,
                        template_id: initialTemplate,
                        source_format: sourceFormat,
                        parent_document_id: documentId,
                    })
                    setVersions([created])
                    setCurrentVersionId(created.id)
                } else {
                    setCurrentVersionId(initialVersionId)
                }
            } catch (err) {
                console.error("Editor load failed:", err)
                toast({ title: "Failed to load resume", variant: "destructive" })
            } finally {
                setIsLoading(false)
            }
        }
        if (editor) {
            load()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, documentId, applicationId])

    const handleNewVersion = async () => {
        if (!editor) return
        setIsSaving(true)
        try {
            const newName = `Version ${versions.length + 1}`
            const created = await resumeVersionsService.saveVersion({
                document_id: documentId,
                application_id: applicationId,
                version_name: newName,
                content_json: editor.getJSON(),
                template_id: templateId,
                source_format: sourceFormat,
                parent_document_id: documentId,
            })
            setVersions([created, ...versions])
            setCurrentVersionId(created.id)
            toast({ title: "Saved as new version" })
        } catch (err) {
            console.error("Capture failed:", err)
            toast({
                title: "Failed to save version",
                description: err instanceof Error ? err.message : "Unknown error",
                variant: "destructive",
            })
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteVersion = async (id: string) => {
        const v = versions.find(x => x.id === id)
        if (!v) return
        const confirmed = window.confirm(`Delete "${v.version_name}"? This cannot be undone.`)
        if (!confirmed) return
        try {
            await resumeVersionsService.deleteVersion(id)
            const remaining = versions.filter(x => x.id !== id)
            setVersions(remaining)
            if (currentVersionId === id) {
                if (remaining.length > 0 && editor) {
                    const next = remaining[0]
                    const doc = (next.content_json as ResumeDoc | null) ??
                        (next.blocks ? blocksToTipTap(next.blocks as EditorBlock[]) : emptyDoc())
                    editor.commands.setContent(doc)
                    setCurrentVersionId(next.id)
                    if (next.template_id) setTemplateId(next.template_id)
                } else {
                    setCurrentVersionId(null)
                    if (editor) editor.commands.setContent(emptyDoc())
                }
            }
            toast({ title: "Version deleted" })
        } catch (err) {
            console.error("Delete version failed:", err)
            toast({
                title: "Failed to delete version",
                description: err instanceof Error ? err.message : "Unknown error",
                variant: "destructive",
            })
        }
    }

    const handleSwitchVersion = (id: string) => {
        if (!editor) return
        const v = versions.find(x => x.id === id)
        if (!v) return
        const doc = (v.content_json as ResumeDoc | null) ??
            (v.blocks ? blocksToTipTap(v.blocks as EditorBlock[]) : emptyDoc())
        editor.commands.setContent(doc)
        setCurrentVersionId(id)
        if (v.template_id) setTemplateId(v.template_id)
    }

    const handleTemplateChange = useCallback(async (id: TemplateId) => {
        setTemplateId(id)
        if (currentVersionId && editor) {
            try {
                const v = versions.find(x => x.id === currentVersionId)
                if (!v) return
                const saved = await resumeVersionsService.saveVersion({
                    id: v.id,
                    document_id: documentId,
                    application_id: applicationId,
                    version_name: v.version_name,
                    content_json: editor.getJSON(),
                    template_id: id,
                    source_format: sourceFormat,
                    parent_document_id: documentId,
                })
                setVersions(prev => prev.map(x => x.id === saved.id ? saved : x))
            } catch (err) {
                console.error("Template switch save failed:", err)
            }
        }
    }, [currentVersionId, editor, versions, documentId, applicationId, sourceFormat])

    const handleAIRewriteSelection = async () => {
        if (!editor) return
        const { from, to, empty } = editor.state.selection
        if (empty) {
            toast({ title: "Select some text first", variant: "destructive" })
            return
        }
        const selectedText = editor.state.doc.textBetween(from, to, '\n')
        if (!selectedText.trim()) return

        setIsRewriting(true)
        try {
            const res = await fetch('/api/editor/ai-rewrite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: selectedText,
                    type: 'paragraph',
                    analysisFeedback: analysis?.recommendations?.join("\n") || "",
                }),
            })
            const data = await res.json()
            if (data.rewritten) {
                editor.chain().focus().insertContentAt({ from, to }, data.rewritten).run()
                toast({ title: "Rewritten" })
            }
        } catch {
            toast({ title: "AI rewrite failed", variant: "destructive" })
        } finally {
            setIsRewriting(false)
        }
    }

    const handleApplyRecommendations = async () => {
        if (!editor || !analysis?.recommendations?.length) {
            toast({ title: "No recommendations to apply", variant: "destructive" })
            return
        }
        const original = editor.getJSON()
        setDiffOriginal(original)
        setDiffProposed(null)
        setDiffOpen(true)
        setDiffLoading(true)
        try {
            const res = await fetch('/api/editor/apply-recommendations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    applicationId,
                    documentId,
                    contentJson: original,
                    recommendations: analysis.recommendations,
                }),
            })
            if (!res.ok) {
                const errText = await res.text()
                throw new Error(errText || "Bulk apply failed")
            }
            const data = await res.json()
            if (data.contentJson) {
                setDiffProposed(data.contentJson as ResumeDoc)
            } else {
                throw new Error("AI returned no content")
            }
        } catch (err) {
            setDiffOpen(false)
            toast({
                title: "Failed to apply recommendations",
                description: err instanceof Error ? err.message : String(err),
                variant: "destructive",
            })
        } finally {
            setDiffLoading(false)
        }
    }

    const acceptDiff = async (mergedDoc: ResumeDoc) => {
        if (!editor) return
        editor.commands.setContent(mergedDoc as unknown as JSONContent)
        setDiffOpen(false)
        setDiffProposed(null)
        setDiffOriginal(null)
        toast({
            title: "Recommendations applied",
            description: "Saved as a new version.",
        })
        try {
            const newName = `Version ${versions.length + 1}`
            const created = await resumeVersionsService.saveVersion({
                document_id: documentId,
                application_id: applicationId,
                version_name: newName,
                content_json: mergedDoc,
                template_id: templateId,
                source_format: sourceFormat,
                parent_document_id: documentId,
            })
            setVersions([created, ...versions])
            setCurrentVersionId(created.id)
        } catch (err) {
            console.error("Failed to capture version after diff accept:", err)
        }
    }

    const handleExport = async (format: 'pdf' | 'docx') => {
        if (!editor) return
        setIsExporting(true)
        try {
            const endpoint = format === 'docx'
                ? '/api/editor/export-docx'
                : '/api/editor/export-pdf'

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contentJson: editor.getJSON(),
                    templateId,
                    fileName,
                    docSettings,
                }),
            })

            if (!res.ok) {
                let errMsg = `Export failed: ${res.status}`
                try {
                    const errBody = await res.json()
                    if (errBody?.error) errMsg = errBody.error
                } catch {
                    // ignore non-JSON body
                }
                throw new Error(errMsg)
            }

            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            const baseName = fileName.replace(/\.(pdf|docx?|txt|json)$/i, "")
            a.href = url
            a.download = `${baseName}_edited.${format}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            toast({ title: `Exported as ${format.toUpperCase()}` })
        } catch (err) {
            console.error("Export error:", err)
            toast({
                title: "Export failed",
                description: err instanceof Error ? err.message : String(err),
                variant: "destructive",
            })
        } finally {
            setIsExporting(false)
        }
    }

    if (isLoading || !editor) {
        return (
            <div className="flex h-[calc(100vh-200px)] items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground animate-pulse font-medium">Loading editor…</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] bg-white dark:bg-background rounded-lg border border-border overflow-hidden">
            <div className="border-b border-border bg-white dark:bg-card z-20 sticky top-0">
                <div className="flex items-center flex-wrap gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 min-h-16 sm:min-h-[68px]">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onBack}
                        className="font-medium text-muted-foreground hover:text-primary hover:bg-muted px-2 sm:px-3"
                    >
                        <ArrowLeft className="h-4 w-4 lg:mr-2" /> <span className="hidden lg:inline">Back</span>
                    </Button>
                    <div className="hidden sm:block h-6 w-px bg-border" />
                    <div className="flex items-center gap-2">
                        <History className="hidden sm:block h-4 w-4 text-muted-foreground shrink-0" />
                        <Select
                            value={currentVersionId ?? undefined}
                            onValueChange={handleSwitchVersion}
                        >
                            <SelectTrigger className="w-[120px] sm:w-[180px] h-9 font-medium bg-muted/40 border-border text-foreground hover:border-primary">
                                <SelectValue placeholder="Select version" />
                            </SelectTrigger>
                            <SelectContent>
                                {versions.length === 0 ? (
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No saved versions yet</div>
                                ) : versions.map(v => (
                                    <div key={v.id} className="flex items-center pr-1 group">
                                        <SelectItem value={v.id} className="flex-1">{v.version_name}</SelectItem>
                                        <button
                                            type="button"
                                            onPointerDown={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleDeleteVersion(v.id)
                                            }}
                                            className="opacity-60 hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                            title={`Delete ${v.version_name}`}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNewVersion}
                            disabled={isSaving}
                            className="h-9 px-2 sm:px-3 border-dashed font-medium bg-muted/40 border-primary/30 text-foreground hover:bg-muted hover:border-primary"
                        >
                            {isSaving ? <Loader2 className="h-3 w-3 lg:mr-2 animate-spin" /> : <Save className="h-3 w-3 lg:mr-2" />}
                            <span className="hidden lg:inline">Save Version</span>
                        </Button>
                    </div>

                    <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleAIRewriteSelection}
                            disabled={isRewriting || selectionEmpty}
                            className="h-9 px-2 sm:px-3 font-medium bg-muted/40 border-primary/40 text-foreground hover:bg-primary/10 hover:border-primary hover:text-primary disabled:opacity-50"
                            title={selectionEmpty ? "Select text in the editor to rewrite" : "Rewrite selected text with AI"}
                        >
                            <Sparkles className="h-3.5 w-3.5 lg:mr-1.5" /> <span className="hidden lg:inline">Ask AI</span>
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleApplyRecommendations}
                            disabled={!analysis?.recommendations?.length || isRewriting}
                            className="h-9 px-2 sm:px-3 font-medium bg-muted/40 border-primary/40 text-foreground hover:bg-primary/10 hover:border-primary hover:text-primary disabled:opacity-50"
                            title={analysis?.recommendations?.length ? "Rewrite resume to address analysis recommendations" : "Run analysis first to enable bulk apply"}
                        >
                            <Wand2 className="h-3.5 w-3.5 xl:mr-1.5" />
                            <span className="hidden xl:inline">Apply Recommendations</span>
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    disabled={isExporting}
                                    className="glow-effect font-semibold h-9 px-3 sm:px-4 bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    {isExporting ? (
                                        <Loader2 className="h-4 w-4 animate-spin lg:mr-2" />
                                    ) : (
                                        <Download className="h-4 w-4 lg:mr-2" />
                                    )}
                                    <span className="hidden lg:inline">Download</span>
                                    <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-80" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => handleExport('pdf')} className="cursor-pointer">
                                    <FileText className="h-4 w-4 mr-2" /> Download as PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExport('docx')} className="cursor-pointer">
                                    <FileType2 className="h-4 w-4 mr-2" /> Download as DOCX
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <div className="border-t border-border bg-white dark:bg-card">
                    <EditorToolbar
                        editor={editor}
                        templateId={templateId}
                        onTemplateChange={handleTemplateChange}
                        docSettings={docSettings}
                        onDocSettingsChange={updateDocSettings}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar bg-white dark:bg-background dark:bg-[radial-gradient(circle_at_50%_0%,rgba(0,255,136,0.04),transparent_60%)]">
                {isRewriting && (
                    <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
                        <div className="bg-card p-5 rounded-2xl shadow-2xl flex items-center gap-4 border border-primary/30 animate-in zoom-in duration-300">
                            <Sparkles className="h-6 w-6 text-primary animate-pulse" />
                            <span className="font-bold text-foreground text-lg">AI is polishing…</span>
                        </div>
                    </div>
                )}

                <div className="min-w-min py-6 sm:py-12 px-3 sm:px-6 flex flex-col items-center gap-8">
                    <div className="flex-shrink-0">
                        {renderTemplate(templateId, { editor, docSettings })}
                    </div>
                </div>
            </div>

            <DiffModal
                open={diffOpen}
                originalDoc={diffOriginal}
                proposedDoc={diffProposed}
                isLoading={diffLoading}
                onCancel={() => {
                    setDiffOpen(false)
                    setDiffProposed(null)
                    setDiffOriginal(null)
                }}
                onAcceptAll={() => {
                    if (diffProposed) acceptDiff(diffProposed)
                }}
                onAcceptPartial={(merged) => acceptDiff(merged)}
            />

            <div className="h-8 border-t border-border bg-white dark:bg-card px-3 sm:px-4 flex items-center justify-between text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-widest font-medium gap-2">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0 overflow-hidden">
                    <span className="truncate max-w-[120px] sm:max-w-none">{fileName}</span>
                    <span className="hidden md:inline">Source: {sourceFormat.toUpperCase()}</span>
                    <span className="hidden lg:inline truncate">Version: {currentVersionId ? versions.find(v => v.id === currentVersionId)?.version_name : 'Unsaved'}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {isSaving ? (
                        <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Saving…</span>
                        </>
                    ) : (
                        <span className="text-primary">✓ Saved</span>
                    )}
                </div>
            </div>
        </div>
    )
}
