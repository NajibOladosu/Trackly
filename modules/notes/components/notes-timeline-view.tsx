"use client"

import { useState } from "react"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Edit2, Trash2, Pin, Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import type { ApplicationNote } from "@/types/database"

interface NotesTimelineViewProps {
  notes: ApplicationNote[]
  onEdit: (note: ApplicationNote) => void
  onDelete: (noteId: string) => Promise<void>
  onTogglePin: (noteId: string, isPinned: boolean) => Promise<void>
  isLoading?: boolean
}

export function NotesTimelineView({
  notes,
  onEdit,
  onDelete,
  onTogglePin,
}: NotesTimelineViewProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pinningId, setPinningId] = useState<string | null>(null)

  const handleDelete = async (noteId: string) => {
    setDeletingId(noteId)
    try {
      await onDelete(noteId)
    } finally {
      setDeletingId(null)
    }
  }

  const handleTogglePin = async (noteId: string, isPinned: boolean) => {
    setPinningId(noteId)
    try {
      await onTogglePin(noteId, isPinned)
    } finally {
      setPinningId(null)
    }
  }

  if (notes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">No notes yet. Create one to get started!</p>
      </div>
    )
  }

  // Group notes by date
  const groupedNotes = notes.reduce(
    (acc, note) => {
      const date = new Date(note.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
      if (!acc[date]) acc[date] = []
      acc[date].push(note)
      return acc
    },
    {} as Record<string, ApplicationNote[]>
  )

  return (
    <div className="space-y-8">
      {Object.entries(groupedNotes).map(([date, dateNotes], dateIndex) => (
        <div key={date} className="relative">
          {/* Date Separator */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground">{date}</h3>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Notes for this date */}
          <div className="space-y-4 ml-6 relative">
            {/* Vertical line connecting notes */}
            {dateNotes.length > 1 && (
              <div className="absolute left-0 top-0 bottom-0 w-px bg-border -ml-[21px]" />
            )}

            {dateNotes.map((note, index) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: (dateIndex * 0.1) + (index * 0.05) }}
                className="flex gap-4"
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`h-3 w-3 rounded-full border-2 ${note.is_pinned
                        ? "bg-primary border-primary"
                        : "bg-background border-border"
                      }`}
                  />
                </div>

                {/* Note content */}
                <div
                  className="flex-1 bg-muted/50 p-4 rounded-lg border border-border cursor-pointer hover:shadow-md transition-all"
                  onClick={() => onEdit(note)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {note.category && (
                        <Badge variant="secondary" className="text-xs">
                          {note.category}
                        </Badge>
                      )}
                      {note.is_pinned && (
                        <Pin className="h-3.5 w-3.5 text-primary fill-primary" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(note.created_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="prose prose-sm dark:prose-invert max-w-none mb-4 line-clamp-3">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: note.content,
                      }}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTogglePin(note.id, note.is_pinned)
                      }}
                      disabled={pinningId === note.id}
                      className="h-8 w-8 p-0"
                    >
                      {pinningId === note.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Pin className={`h-4 w-4 ${note.is_pinned ? "text-primary fill-primary" : ""}`} />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(note)
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(note.id)
                      }}
                      disabled={deletingId === note.id}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      {deletingId === note.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
