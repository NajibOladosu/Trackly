"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Label } from "@/shared/ui/label"
import { ConfirmModal } from "@/components/modals/confirm-modal"
import { Users, Plus, Pencil, Trash2, Mail, Linkedin, Loader2 } from "lucide-react"
import type { ApplicationContact } from "@/types/database"
import {
  getContactsByApplicationId,
  createContact,
  updateContact,
  deleteContact,
  type ContactInput,
} from "@/modules/applications/services/contact.service"

const EMPTY: ContactInput = { name: "", role: "", email: "", linkedin_url: "", notes: "" }

interface ContactsTabProps {
  applicationId: string
}

export function ContactsTab({ applicationId }: ContactsTabProps) {
  const [contacts, setContacts] = useState<ApplicationContact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ContactInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getContactsByApplicationId(applicationId)
      .then(setContacts)
      .catch((e) => {
        console.error("Failed to load contacts:", e)
        setError("Failed to load contacts.")
      })
      .finally(() => setLoading(false))
  }, [applicationId])

  const openAdd = () => {
    setForm(EMPTY)
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (c: ApplicationContact) => {
    setForm({
      name: c.name,
      role: c.role ?? "",
      email: c.email ?? "",
      linkedin_url: c.linkedin_url ?? "",
      notes: c.notes ?? "",
    })
    setEditingId(c.id)
    setShowForm(true)
  }

  const setField = (key: keyof ContactInput, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        const updated = await updateContact(editingId, form)
        setContacts((prev) => prev.map((c) => (c.id === editingId ? updated : c)))
      } else {
        const created = await createContact(applicationId, form)
        setContacts((prev) => [created, ...prev])
      }
      setShowForm(false)
      setForm(EMPTY)
      setEditingId(null)
    } catch (e) {
      console.error("Failed to save contact:", e)
      setError("Failed to save contact. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteContact(deleteId)
      setContacts((prev) => prev.filter((c) => c.id !== deleteId))
    } catch (e) {
      console.error("Failed to delete contact:", e)
      setError("Failed to delete contact.")
    } finally {
      setDeleteId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-foreground dark:text-primary" />
          Contacts
        </h2>
        {!showForm && (
          <Button onClick={openAdd} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add contact
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showForm && (
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Name *</Label>
                <Input id="c-name" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Jordan Lee" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-role">Role</Label>
                <Input id="c-role" value={form.role ?? ""} onChange={(e) => setField("role", e.target.value)} placeholder="Technical Recruiter" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" type="email" value={form.email ?? ""} onChange={(e) => setField("email", e.target.value)} placeholder="jordan@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-linkedin">LinkedIn URL</Label>
                <Input id="c-linkedin" value={form.linkedin_url ?? ""} onChange={(e) => setField("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-notes">Notes</Label>
              <Textarea id="c-notes" rows={2} value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} placeholder="How you met, last conversation, next step..." />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? "Update" : "Save"}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null) }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {contacts.length === 0 && !showForm ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              No contacts yet. Log recruiters, referrers, and hiring managers tied to this application.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {contacts.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.name}
                      {c.role && <span className="text-muted-foreground font-normal"> · {c.role}</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {c.email}
                        </a>
                      )}
                      {c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Linkedin className="h-3 w-3" />
                          LinkedIn
                        </a>
                      )}
                    </div>
                    {c.notes && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{c.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)} aria-label={`Delete ${c.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete contact?"
        description="This removes the contact from this application. This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
