"use client"

import { useEffect, useState, useRef } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Badge } from "@/shared/ui/badge"
import { User, Mail, Calendar, Github, Linkedin, Loader2, Edit2, Upload } from "lucide-react"
import { createClient } from "@/shared/db/supabase/client"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { PromptModal } from "@/components/modals/prompt-modal"
import { AlertModal } from "@/components/modals/alert-modal"
import { ImportApplicationsModal } from "@/modules/applications/components/modals/import-applications-modal"

interface Profile {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  created_at: string
}

export default function ProfilePage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showDeletePrompt, setShowDeletePrompt] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError
        if (!user) {
          setError("You must be logged in to view your profile.")
          setLoading(false)
          return
        }

        setUser(user)

        const { data, error: profileError } = await supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single()

        if (profileError) throw profileError

        const p = data as Profile
        setProfile(p)
        // Priority: Google full_name > database name > metadata name
        const fullName =
          user.user_metadata?.full_name ||
          p.name ||
          user.user_metadata?.name ||
          ""
        setName(fullName)
        setAvatarUrl(p.avatar_url || user.user_metadata?.avatar_url || "")
      } catch (err) {
        console.error("Error loading profile:", err)
        setError("Unable to load your profile. Please try again.")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [supabase])

  const initials =
    (name || profile?.email || user?.email || "?")
      .split(" ")
      .filter((part) => part)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"

  const handleSave = async () => {
    if (!user || !profile) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const { error: updateError } = await supabase
        .from("users")
        .update({
          name: name || null,
          avatar_url: avatarUrl || null,
        })
        .eq("id", user.id)

      if (updateError) throw updateError

      setProfile((prev) =>
        prev
          ? {
            ...prev,
            name: name || prev.name,
            avatar_url: avatarUrl || prev.avatar_url,
          }
          : prev
      )
      setSuccess(true)
    } catch (err) {
      console.error("Error updating profile:", err)
      setError("Failed to save changes. Please try again.")
    } finally {
      setSaving(false)
      setTimeout(() => setSuccess(false), 2500)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploadingAvatar(true)
    setAvatarError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setAvatarError(data.error || "Failed to upload avatar")
        return
      }

      setAvatarUrl(data.avatar_url)
      setProfile((prev) =>
        prev
          ? { ...prev, avatar_url: data.avatar_url }
          : prev
      )
    } catch (err) {
      console.error("Error uploading avatar:", err)
      setAvatarError("An error occurred while uploading your avatar")
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleDeleteAccount = async () => {
    if (!user) return

    setDeletingAccount(true)
    setDeleteError(null)

    try {
      console.log("🗑️ Calling account deletion API...")
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = await response.json()

      if (!response.ok) {
        console.error("❌ Deletion failed:", data)
        setDeleteError(data.error || "Failed to delete account. Please try again.")
        setDeletingAccount(false)
        return
      }

      console.log("✅ Account deleted successfully")

      // Wait a moment for backend to process, then redirect to home
      setTimeout(() => {
        window.location.href = "/"
      }, 1000)
    } catch (err) {
      console.error("Error deleting account:", err)
      setDeleteError("An unexpected error occurred. Please try again.")
      setDeletingAccount(false)
    }
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

  if (!user || !profile) {
    return (
      <DashboardLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <p className="text-sm text-destructive">
            {error || "Unable to load profile."}
          </p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">Profile</h1>
          <p className="text-muted-foreground">
            Manage your personal information and preferences
          </p>
        </div>

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Update your profile details and photo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
              {/* Avatar Section */}
              <div className="flex flex-col items-center md:items-start space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  disabled={uploadingAvatar}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="relative h-32 w-32 rounded-full bg-gradient-to-br from-primary to-primary/60 overflow-hidden shadow-lg shadow-primary/20 flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-50"
                  title="Click to change avatar"
                >
                  {/* Always show initials as fallback */}
                  <span className="text-4xl font-bold text-primary-foreground select-none">
                    {initials}
                  </span>
                  {/* Show image on top if available */}
                  {avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover rounded-full"
                      onError={(e) => {
                        // Hide broken image to show initials beneath
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  )}
                  {/* Edit Icon Overlay */}
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    {uploadingAvatar ? (
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    ) : (
                      <Edit2 className="h-6 w-6 text-white" />
                    )}
                  </div>
                </button>
                {avatarError && (
                  <p className="text-xs text-destructive text-center">{avatarError}</p>
                )}
              </div>

              {/* Form Fields Section */}
              <div className="md:col-span-2 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    Full Name
                  </label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    disabled
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Button
                className="glow-effect"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
              {success && (
                <span className="text-xs text-primary">
                  Profile updated.
                </span>
              )}
              {error && (
                <span className="text-xs text-destructive">
                  {error}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Account Overview</CardTitle>
            <CardDescription>
              Your ApplyOS account statistics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p className="font-semibold">
                    {profile.created_at
                      ? new Date(profile.created_at).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                  <User className="h-6 w-6 text-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Plan</p>
                  <Badge variant="default">Free</Badge>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                  <Mail className="h-6 w-6 text-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email Status</p>
                  <Badge variant="default">Verified</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Import Applications */}
        <Card>
          <CardHeader>
            <CardTitle>Import Applications</CardTitle>
            <CardDescription>
              Import applications from Google Sheets or Excel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a CSV file to import application data. Your applications will be added to your account with all the details like status, priority, deadline, and notes.
              </p>
              <Button
                onClick={() => setShowImportModal(true)}
                className="glow-effect"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import from CSV
              </Button>
              {importSuccess && (
                <div className="bg-primary/10 border border-primary/30 p-3 rounded-lg">
                  <p className="text-sm text-primary font-medium">{importSuccess}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Connected Accounts (placeholder, no fake connections) */}
        <Card>
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
            <CardDescription>
              Link your professional profiles for better AI responses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div className="flex items-center space-x-3">
                <Linkedin className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-medium">LinkedIn</p>
                  <p className="text-sm text-muted-foreground">
                    Integration not configured
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled>
                Coming soon
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div className="flex items-center space-x-3">
                <Github className="h-5 w-5" />
                <div>
                  <p className="font-medium">GitHub</p>
                  <p className="text-sm text-muted-foreground">
                    Integration not configured
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled>
                Coming soon
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Permanently delete your account and all associated data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium">Delete Account</p>
                <p className="text-sm text-muted-foreground">
                  This will delete your ApplyOS profile, applications, questions,
                  documents, notifications, and status history. This action cannot
                  be undone.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setShowDeletePrompt(true)}
                className="flex-shrink-0 whitespace-nowrap"
              >
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Delete Account Prompt Modal */}
        <PromptModal
          isOpen={showDeletePrompt}
          title="Delete Your Account?"
          description="This action is permanent and cannot be undone. All your data including applications, documents, and settings will be deleted."
          placeholder="Type DELETE to confirm"
          requiredValue="DELETE"
          confirmText="Delete My Account"
          cancelText="Cancel"
          variant="destructive"
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDeletePrompt(false)}
          isLoading={deletingAccount}
        />

        {/* Delete Error Modal */}
        <AlertModal
          isOpen={!!deleteError}
          title="Error"
          message={deleteError || ""}
          type="error"
          onClose={() => setDeleteError(null)}
        />

        {/* Import Applications Modal */}
        <ImportApplicationsModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onSuccess={(count) => {
            setShowImportModal(false)
            setImportSuccess(`Successfully imported ${count} application${count !== 1 ? "s" : ""}!`)
            // Clear the success message after 5 seconds
            setTimeout(() => setImportSuccess(null), 5000)
          }}
        />
      </div>
    </DashboardLayout>
  )
}
