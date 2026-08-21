import { createClient } from '@/shared/db/supabase/client'
import type { Application, ApplicationStatus, ApplicationPriority } from '@/types/database'

export async function getApplications() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Application[]
}

export async function getApplication(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Application
}

export async function createApplication(application: {
  title: string
  company?: string
  url?: string
  type?: string
  priority?: ApplicationPriority
  deadline?: string
  job_description?: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('applications')
    .insert([
      {
        user_id: user.id,
        ...application,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data as Application
}

export async function updateApplication(id: string, updates: Partial<Application>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Application
}

export async function deleteApplication(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function deleteApplications(ids: string[]) {
  if (ids.length === 0) return
  const supabase = createClient()
  const { error } = await supabase
    .from('applications')
    .delete()
    .in('id', ids)

  if (error) throw error
}

export async function setApplicationArchived(id: string, archived: boolean) {
  const supabase = createClient()
  const { error } = await supabase
    .from('applications')
    .update({ archived })
    .eq('id', id)

  if (error) throw error
}

export async function updateApplicationsStatus(ids: string[], status: ApplicationStatus) {
  if (ids.length === 0) return
  const supabase = createClient()
  const { error } = await supabase
    .from('applications')
    .update({ status })
    .in('id', ids)

  if (error) throw error
}

export async function getApplicationStats() {
  const supabase = createClient()
  const { data: applications, error } = await supabase
    .from('applications')
    .select('status, created_at')

  if (error) throw error

  const total = applications?.length || 0
  const pending = applications?.filter(app => app.status === 'in_review').length || 0

  // Get applications with upcoming deadlines (next 7 days)
  const { data: deadlineApps } = await supabase
    .from('applications')
    .select('deadline')
    .gte('deadline', new Date().toISOString())
    .lte('deadline', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())

  const upcomingDeadlines = deadlineApps?.length || 0

  return {
    total,
    pending,
    upcomingDeadlines,
  }
}

export async function getApplicationDocuments(applicationId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('application_documents')
    .select('document_id')
    .eq('application_id', applicationId)

  if (error) throw error
  return (data || []).map(row => row.document_id)
}

export async function getApplicationDocumentDetails(applicationId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('document_analyses')
    .select('document_id, analysis_result, analysis_status, summary_generated_at')
    .eq('application_id', applicationId)

  if (error) throw error
  return data || []
}

export async function addApplicationDocument(applicationId: string, documentId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('application_documents')
    .insert([
      {
        application_id: applicationId,
        document_id: documentId,
      },
    ])

  if (error) throw error
}

export async function removeApplicationDocument(applicationId: string, documentId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('application_documents')
    .delete()
    .eq('application_id', applicationId)
    .eq('document_id', documentId)

  if (error) throw error
}

export async function updateApplicationDocuments(applicationId: string, documentIds: string[]) {
  const supabase = createClient()

  // Delete all existing relationships
  const { error: deleteError } = await supabase
    .from('application_documents')
    .delete()
    .eq('application_id', applicationId)

  if (deleteError) throw deleteError

  // Insert new relationships
  if (documentIds.length > 0) {
    const { error: insertError } = await supabase
      .from('application_documents')
      .insert(
        documentIds.map(docId => ({
          application_id: applicationId,
          document_id: docId,
        }))
      )

    if (insertError) throw insertError
  }
}
