"use client"

import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { Card, CardContent } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Badge } from "@/shared/ui/badge"
import { motion } from "framer-motion"
import {
  Plus,
  Search,
  Calendar,
  Briefcase,
  Eye,
  Trash2,
  ExternalLink,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import {
  getApplications,
  deleteApplication,
  deleteApplications,
  updateApplicationsStatus,
} from "@/modules/applications/services/application.service"
import type { Application, ApplicationStatus } from "@/types/database"
import { AddApplicationModal } from "@/modules/applications/components/modals/add-application-modal"
import { ConfirmModal } from "@/components/modals/confirm-modal"
import { AlertModal } from "@/components/modals/alert-modal"
import { BulkActionToolbar } from "@/modules/applications/components/bulk-action-toolbar"
import {
  daysUntilDeadline,
  urgencyTier,
  urgencyLabel,
  type UrgencyTier,
} from "@/modules/applications/lib/deadline"

type SortKey = "newest" | "deadline" | "priority"

const urgencyClass: Record<UrgencyTier, string> = {
  overdue: "text-red-400 bg-red-500/10 border-red-500/30",
  critical: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  soon: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  later: "text-muted-foreground",
  none: "text-muted-foreground",
}

const statusConfig = {
  draft: { label: "Draft", variant: "secondary" as const, color: "bg-zinc-800/80 text-muted-foreground backdrop-blur-sm border-0" },
  submitted: { label: "Submitted", variant: "secondary" as const, color: "bg-zinc-800/80 text-zinc-300 backdrop-blur-sm border-0" },
  in_review: { label: "In Review", variant: "secondary" as const, color: "bg-zinc-800/80 text-sky-300 backdrop-blur-sm border-0" },
  interview: { label: "Interview", variant: "default" as const, color: "bg-primary text-primary-foreground" },
  offer: { label: "Offer", variant: "default" as const, color: "bg-primary text-primary-foreground ring-2 ring-primary/20" },
  rejected: { label: "Rejected", variant: "secondary" as const, color: "bg-zinc-800/80 text-destructive/80 line-through backdrop-blur-sm border-0" },
}

const priorityConfig = {
  low: { color: "bg-green-500" },
  medium: { color: "bg-yellow-500" },
  high: { color: "bg-red-500" },
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [sortBy, setSortBy] = useState<SortKey>("newest")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  useEffect(() => {
    fetchApplications()
  }, [])

  const fetchApplications = async () => {
    try {
      const data = await getApplications()
      setApplications(data)
    } catch (error) {
      console.error('Error fetching applications:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (id: string) => {
    setDeletingId(id)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingId) return

    setDeleteLoading(true)
    try {
      await deleteApplication(deletingId)
      setApplications(apps => apps.filter(app => app.id !== deletingId))
      setDeleteConfirmOpen(false)
      setDeletingId(null)
    } catch (error) {
      console.error('Error deleting application:', error)
      setDeleteError('Failed to delete application. Please try again.')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setDeletingId(null)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredApplications.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredApplications.map((a) => a.id)))
    }
  }

  const handleBulkDelete = async () => {
    setBulkLoading(true)
    try {
      const ids = Array.from(selectedIds)
      await deleteApplications(ids)
      setApplications((apps) => apps.filter((a) => !selectedIds.has(a.id)))
      setSelectedIds(new Set())
      setBulkDeleteConfirmOpen(false)
    } catch (error) {
      console.error('Bulk delete failed:', error)
      setDeleteError('Failed to delete the selected applications. Please try again.')
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBulkStatusChange = async (status: ApplicationStatus) => {
    const ids = Array.from(selectedIds)
    setBulkLoading(true)
    try {
      await updateApplicationsStatus(ids, status)
      setApplications((apps) =>
        apps.map((a) => (selectedIds.has(a.id) ? { ...a, status } : a))
      )
      setSelectedIds(new Set())
    } catch (error) {
      console.error('Bulk status update failed:', error)
      setDeleteError('Failed to update status for the selected applications.')
    } finally {
      setBulkLoading(false)
    }
  }

  const filteredApplications = applications
    .filter((app) => {
      const matchesSearch =
        app.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.company && app.company.toLowerCase().includes(searchQuery.toLowerCase()))
      const matchesStatus = selectedStatus === "all" || app.status === selectedStatus
      return matchesSearch && matchesStatus
    })
    .sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      if (sortBy === "deadline") {
        const da = daysUntilDeadline(a.deadline)
        const db = daysUntilDeadline(b.deadline)
        if (da === null && db === null) return 0
        if (da === null) return 1
        if (db === null) return -1
        return da - db
      }
      const priorityOrder = { high: 0, medium: 1, low: 2 } as const
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Applications</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage and track all your job and scholarship applications
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Link href="/apply" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-auto">
                New Apply Kit
              </Button>
            </Link>
            <Button className="glow-effect w-full sm:w-auto" onClick={() => setIsModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Application
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search applications..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                <Button
                  variant={selectedStatus === "all" ? "default" : "outline"}
                  onClick={() => setSelectedStatus("all")}
                  size="sm"
                >
                  All
                </Button>
                <Button
                  variant={selectedStatus === "draft" ? "default" : "outline"}
                  onClick={() => setSelectedStatus("draft")}
                  size="sm"
                >
                  Draft
                </Button>
                <Button
                  variant={selectedStatus === "submitted" ? "default" : "outline"}
                  onClick={() => setSelectedStatus("submitted")}
                  size="sm"
                >
                  Submitted
                </Button>
                <Button
                  variant={selectedStatus === "in_review" ? "default" : "outline"}
                  onClick={() => setSelectedStatus("in_review")}
                  size="sm"
                >
                  In Review
                </Button>
                <Button
                  variant={selectedStatus === "interview" ? "default" : "outline"}
                  onClick={() => setSelectedStatus("interview")}
                  size="sm"
                >
                  Interview
                </Button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Sort:</span>
                  <select
                    className="text-sm bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortKey)}
                    aria-label="Sort applications"
                  >
                    <option value="newest">Newest first</option>
                    <option value="deadline">Deadline (soonest)</option>
                    <option value="priority">Priority (high first)</option>
                  </select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Action Toolbar */}
        <BulkActionToolbar
          selectedCount={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          onDelete={() => setBulkDeleteConfirmOpen(true)}
          onStatusChange={handleBulkStatusChange}
          disabled={bulkLoading}
        />

        {/* Select-all toggle */}
        {filteredApplications.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 cursor-pointer"
              checked={
                selectedIds.size > 0 &&
                selectedIds.size === filteredApplications.length
              }
              ref={(el) => {
                if (el) {
                  el.indeterminate =
                    selectedIds.size > 0 &&
                    selectedIds.size < filteredApplications.length
                }
              }}
              onChange={toggleSelectAll}
              aria-label="Select all applications"
            />
            <span className="text-xs text-muted-foreground">
              {selectedIds.size > 0
                ? `${selectedIds.size} of ${filteredApplications.length} selected`
                : 'Select all'}
            </span>
          </div>
        )}

        {/* Applications Grid */}
        <div className="grid grid-cols-1 gap-4">
          {filteredApplications.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {searchQuery || selectedStatus !== "all" ? "No applications found" : "No applications yet"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery || selectedStatus !== "all"
                    ? "Try adjusting your search or filters"
                    : "Create your first application to get started"}
                </p>
                <Button onClick={() => setIsModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Application
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredApplications.map((app, index) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card
                  className={`hover:border-primary/40 transition-all ${
                    selectedIds.has(app.id) ? 'border-primary/60 bg-primary/5' : ''
                  }`}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          className="h-4 w-4 mt-2 rounded border-zinc-700 bg-zinc-900 cursor-pointer shrink-0"
                          checked={selectedIds.has(app.id)}
                          onChange={() => toggleSelect(app.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${app.title}`}
                        />
                        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                          <Briefcase className="h-5 w-5 sm:h-6 sm:w-6 text-foreground" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 sm:gap-3 mb-2">
                            <Link href={`/applications/${app.id}`} className="flex-1 min-w-0">
                              <h3 className="text-base sm:text-lg font-semibold truncate hover:text-primary transition-colors cursor-pointer">{app.title}</h3>
                              {app.company && (
                                <p className="text-sm text-muted-foreground mt-0.5">{app.company}</p>
                              )}
                            </Link>
                            <div className={`h-2 w-2 rounded-full shrink-0 ${priorityConfig[app.priority].color}`} />
                          </div>

                          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground mb-3">
                            {(() => {
                              const days = daysUntilDeadline(app.deadline)
                              const tier = urgencyTier(days)
                              const isPill = tier === "overdue" || tier === "critical" || tier === "soon"
                              const baseClass = "flex items-center gap-1.5 sm:gap-2"
                              const wrapperClass = isPill
                                ? `${baseClass} px-2 py-0.5 rounded border ${urgencyClass[tier]} font-medium`
                                : `${baseClass} ${urgencyClass[tier]}`
                              return (
                                <div className={wrapperClass}>
                                  <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                  <span>
                                    {urgencyLabel(days)}
                                    {app.deadline && tier !== "later" && (
                                      <span className="ml-1 opacity-70 font-normal">
                                        · {new Date(app.deadline).toLocaleDateString()}
                                      </span>
                                    )}
                                    {app.deadline && tier === "later" && (
                                      <span className="ml-1">
                                        ({new Date(app.deadline).toLocaleDateString()})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              )
                            })()}
                            <Badge variant="outline" className="capitalize text-xs">
                              {app.type}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={statusConfig[app.status].variant} className="text-xs">
                              {statusConfig[app.status].label}
                            </Badge>
                            {app.url && (
                              <a
                                href={app.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span>View posting</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:flex-col sm:gap-2 self-end sm:self-start">
                        <Button variant="ghost" size="icon" asChild className="h-9 w-9">
                          <Link href={`/applications/${app.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive h-9 w-9"
                          onClick={() => handleDeleteClick(app.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Add Application Modal */}
      <AddApplicationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchApplications}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="Delete Application?"
        description="This action cannot be undone. Are you sure you want to delete this application?"
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        isLoading={deleteLoading}
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={bulkDeleteConfirmOpen}
        title={`Delete ${selectedIds.size} application${selectedIds.size !== 1 ? 's' : ''}?`}
        description="This action cannot be undone."
        confirmText="Delete all"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
        isLoading={bulkLoading}
      />

      {/* Delete Error Modal */}
      <AlertModal
        isOpen={!!deleteError}
        title="Error"
        message={deleteError || ""}
        type="error"
        onClose={() => setDeleteError(null)}
      />
    </DashboardLayout>
  )
}
