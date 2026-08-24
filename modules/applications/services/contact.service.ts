import { createClient } from '@/shared/db/supabase/client'
import type { ApplicationContact } from '@/types/database'

export interface ContactInput {
  name: string
  role?: string | null
  email?: string | null
  linkedin_url?: string | null
  notes?: string | null
}

export async function getContactsByApplicationId(applicationId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('application_contacts')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as ApplicationContact[]
}

export async function createContact(applicationId: string, contact: ContactInput) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('application_contacts')
    .insert([
      {
        application_id: applicationId,
        user_id: user.id,
        name: contact.name,
        role: contact.role || null,
        email: contact.email || null,
        linkedin_url: contact.linkedin_url || null,
        notes: contact.notes || null,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data as ApplicationContact
}

export async function updateContact(contactId: string, updates: Partial<ContactInput>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('application_contacts')
    .update(updates)
    .eq('id', contactId)
    .select()
    .single()

  if (error) throw error
  return data as ApplicationContact
}

export async function deleteContact(contactId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('application_contacts')
    .delete()
    .eq('id', contactId)

  if (error) throw error
}
