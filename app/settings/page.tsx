"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Bell,
  Download,
  Key,
  Palette,
  Loader2,
  Sun,
  Moon,
  Monitor,
  Chrome,
} from "lucide-react"
import { createClient } from "@/shared/db/supabase/client"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/ui/dialog"

type NotificationPrefs = {
  email_notifications: boolean
  deadline_reminders: boolean
  status_updates: boolean
}

type AiSettings = {
  auto_generate_answers: boolean
}

export default function SettingsPage() {
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Local, persisted-like settings (stored in user metadata for now)
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    email_notifications: true,
    deadline_reminders: true,
    status_updates: true,
  })
  const [aiSettings, setAiSettings] = useState<AiSettings>({
    auto_generate_answers: true,
  })

  // Password change modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

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
          setError("You must be logged in to view settings.")
          setLoading(false)
          return
        }
        setUser(user)

        const meta = (user.user_metadata || {}) as Record<string, unknown>

        setNotificationPrefs({
          email_notifications:
            typeof meta.email_notifications === "boolean"
              ? meta.email_notifications
              : true,
          deadline_reminders:
            typeof meta.deadline_reminders === "boolean"
              ? meta.deadline_reminders
              : true,
          status_updates:
            typeof meta.status_updates === "boolean"
              ? meta.status_updates
              : true,
        })

        setAiSettings({
          auto_generate_answers:
            typeof meta.auto_generate_answers === "boolean"
              ? meta.auto_generate_answers
              : true,
        })
      } catch (err) {
        console.error("Error loading settings:", err)
        setError("Unable to load your settings. Please try again.")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [supabase])

  const persistSettings = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const updatedMetadata = {
        ...user.user_metadata,
        ...notificationPrefs,
        ...aiSettings,
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: updatedMetadata,
      })

      if (updateError) throw updateError
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      console.error("Error saving settings:", err)
      setError("Failed to save settings. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordError(null)
    setPasswordSuccess(false)

    // Validation
    if (!currentPassword.trim()) {
      setPasswordError("Current password is required")
      return
    }
    if (!newPassword.trim()) {
      setPasswordError("New password is required")
      return
    }
    if (!confirmPassword.trim()) {
      setPasswordError("Password confirmation is required")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match")
      return
    }
    if (newPassword === currentPassword) {
      setPasswordError("New password must be different from current password")
      return
    }

    setPasswordLoading(true)
    try {
      // First, verify current password by attempting to sign in
      if (!user?.email) {
        throw new Error("User email not found")
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })

      if (signInError) {
        setPasswordError("Current password is incorrect")
        return
      }

      // If verification successful, update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        setPasswordError(
          updateError.message || "Failed to update password. Please try again."
        )
        return
      }

      setPasswordSuccess(true)
      // Clear form
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      // Close modal after success
      setTimeout(() => {
        setShowPasswordModal(false)
        setPasswordSuccess(false)
      }, 1500)
    } catch (err) {
      console.error("Error changing password:", err)
      setPasswordError("An error occurred while changing your password")
    } finally {
      setPasswordLoading(false)
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

  if (!user) {
    return (
      <DashboardLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <p className="text-sm text-destructive">
            {error || "You must be logged in to manage settings."}
          </p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Settings</h1>
            <p className="text-muted-foreground">
              Manage your account settings and preferences
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={persistSettings}
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
              <span className="text-xs text-primary">Saved.</span>
            )}
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
          </div>
        </div>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>
              Stored in your user metadata. Used to tailor how ApplyOS notifies you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Email Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Receive email updates for important events
                  </p>
                </div>
              </div>
              <Button
                variant={
                  notificationPrefs.email_notifications ? "default" : "outline"
                }
                size="sm"
                onClick={() =>
                  setNotificationPrefs((prev) => ({
                    ...prev,
                    email_notifications: !prev.email_notifications,
                  }))
                }
              >
                {notificationPrefs.email_notifications ? "Enabled" : "Disabled"}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Deadline Reminders</p>
                  <p className="text-sm text-muted-foreground">
                    Get reminded before application deadlines
                  </p>
                </div>
              </div>
              <Button
                variant={
                  notificationPrefs.deadline_reminders
                    ? "default"
                    : "outline"
                }
                size="sm"
                onClick={() =>
                  setNotificationPrefs((prev) => ({
                    ...prev,
                    deadline_reminders: !prev.deadline_reminders,
                  }))
                }
              >
                {notificationPrefs.deadline_reminders
                  ? "Enabled"
                  : "Disabled"}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Status Updates</p>
                  <p className="text-sm text-muted-foreground">
                    Notifications when application status changes
                  </p>
                </div>
              </div>
              <Button
                variant={
                  notificationPrefs.status_updates ? "default" : "outline"
                }
                size="sm"
                onClick={() =>
                  setNotificationPrefs((prev) => ({
                    ...prev,
                    status_updates: !prev.status_updates,
                  }))
                }
              >
                {notificationPrefs.status_updates ? "Enabled" : "Disabled"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI Settings */}
        <Card>
          <CardHeader>
            <CardTitle>AI Features</CardTitle>
            <CardDescription>
              Configure AI-powered features (per-user preferences stored in metadata).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Auto-generate Responses
              </label>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground max-w-md">
                  When enabled, ApplyOS can automatically generate AI answers
                  for new application questions using your documents and profile.
                </p>
                <Button
                  variant={
                    aiSettings.auto_generate_answers ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() =>
                    setAiSettings((prev) => ({
                      ...prev,
                      auto_generate_answers: !prev.auto_generate_answers,
                    }))
                  }
                >
                  {aiSettings.auto_generate_answers
                    ? "Enabled"
                    : "Disabled"}
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>
              Manage your account security and authentication settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Key className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Change Password</p>
                  <p className="text-sm text-muted-foreground">
                    Update your account password securely.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPasswordModal(true)}
                className="hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                Change
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Data & Privacy (coming soon) */}
        <Card>
          <CardHeader>
            <CardTitle>Data & Privacy</CardTitle>
            <CardDescription>
              Manage your data and privacy settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Download className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Export Data</p>
                  <p className="text-sm text-muted-foreground">
                    Download all your data as JSON or CSV (requires an API endpoint).
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled>
                Coming soon
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Browser Extension */}
        <Card>
          <CardHeader>
            <CardTitle>Browser Extension</CardTitle>
            <CardDescription>
              Install the Chrome extension to easily save jobs from any website.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Chrome className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Chrome Extension</p>
                  <p className="text-sm text-muted-foreground">
                    Download the latest release and install it in Chrome.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <a
                  href="https://chromewebstore.google.com/detail/gikepikgajfppgebbgcikhocdeejandg?utm_source=item-share-cb"
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                  <Download className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Customize how ApplyOS looks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Palette className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Theme</p>
                  <p className="text-sm text-muted-foreground">
                    Choose between light and dark mode
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                <Button
                  variant={theme === 'light' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTheme('light')}
                  className="gap-2"
                >
                  <Sun className="h-4 w-4" />
                  Light
                </Button>
                <Button
                  variant={theme === 'dark' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTheme('dark')}
                  className="gap-2"
                >
                  <Moon className="h-4 w-4" />
                  Dark
                </Button>
                <Button
                  variant={theme === 'system' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTheme('system')}
                  className="gap-2"
                >
                  <Monitor className="h-4 w-4" />
                  System
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Password Change Modal */}
        <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
              <DialogDescription>
                Enter your current password and choose a new one.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Current Password */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Current Password</label>
                <Input
                  type="password"
                  placeholder="Enter your current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={passwordLoading}
                />
              </div>

              {/* New Password */}
              <div className="space-y-2">
                <label className="text-sm font-medium">New Password</label>
                <Input
                  type="password"
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={passwordLoading}
                />
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm New Password</label>
                <Input
                  type="password"
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={passwordLoading}
                />
              </div>

              {/* Error Message */}
              {passwordError && (
                <div className="rounded-md bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">{passwordError}</p>
                </div>
              )}

              {/* Success Message */}
              {passwordSuccess && (
                <div className="rounded-md bg-primary/10 p-3">
                  <p className="text-sm text-primary">
                    Password changed successfully!
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowPasswordModal(false)}
                disabled={passwordLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={passwordLoading}
              >
                {passwordLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
