"use client"

import { useState } from "react"
import { Card, CardContent } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Edit2, Trash2, Pin, Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import type { ApplicationNote } from "@/types/database"

interface NotesCardViewProps {
  notes: ApplicationNote[]
  onEdit: (note: ApplicationNote) => void
  onDelete: (noteId: string) => Promise<void>
  onTogglePin: (noteId: string, isPinned: boolean) => Promise<void>
  isLoading?: boolean
}

export function NotesCardView({
  notes,
  onEdit,
  onDelete,
  onTogglePin,
}: NotesCardViewProps) {
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-max">
      {notes.map((note, index) => (
        <motion.div
          key={note.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
          className="w-full"
        >
          <Card
            className="w-full h-48 flex flex-col cursor-pointer hover:shadow-2xl transition-all border-2 border-opacity-40 shadow-lg shadow-black/20 hover:shadow-black/30 bg-gradient-to-br from-background to-background/95"
            onClick={() => onEdit(note)}
          >
            <CardContent className="p-4 flex-1 flex flex-col gap-3 min-h-0">
              {/* Header with Pin and Category */}
              <div className="flex items-start justify-between gap-2 shrink-0">
                <div className="flex-1 min-w-0">
                  {note.category && (
                    <Badge variant="secondary" className="text-xs mb-2">
                      {note.category}
                    </Badge>
                  )}
                </div>
                {note.is_pinned && (
                  <Pin className="h-4 w-4 text-primary fill-primary shrink-0" />
                )}
              </div>

              {/* Content Preview */}
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="prose prose-sm dark:prose-invert max-w-none line-clamp-3 h-full">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: note.content,
                    }}
                  />
                </div>
              </div>

              {/* Footer with Date and Actions */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t shrink-0">
                <span className="text-xs text-muted-foreground">
                  {new Date(note.created_at).toLocaleDateString()}
                </span>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
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
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
