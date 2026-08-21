import { createClient } from "@/shared/db/supabase/client"
import type { Document } from "@/types/database"
import type { ParsedDocument } from "@/shared/infrastructure/ai"

export async function getDocuments() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data as Document[]
}

/**
 * Get documents with successful analysis (ready to use as context for AI)
 * Filters for analysis_status = 'success' with non-null parsed_data
 */
export async function getAnalyzedDocuments() {
  const docs = await getDocuments()
  return docs.filter((doc) => doc.analysis_status === "success" && doc.parsed_data)
}

/**
 * Build AI context from analyzed document data
 * Converts ParsedDocument structured data into readable strings for AI prompt
 * @param doc Document with parsed_data
 * @returns Context object ready for generateAnswer()
 */
export function buildContextFromDocument(doc: Document): {
  resume?: string
  experience?: string
  education?: string
} {
  const context = {
    resume: undefined as string | undefined,
    experience: undefined as string | undefined,
    education: undefined as string | undefined,
  }

  if (!doc.parsed_data) return context

  const parsed = doc.parsed_data as ParsedDocument

  // Format experience
  if (parsed.experience && parsed.experience.length > 0) {
    context.experience = parsed.experience
      .map(
        (exp) =>
          `${exp.role} at ${exp.company} (${exp.start_date} - ${exp.end_date}): ${exp.description}`
      )
      .join("\n")
  }

  // Format education
  if (parsed.education && parsed.education.length > 0) {
    context.education = parsed.education
      .map(
        (edu) =>
          `${edu.degree} in ${edu.field} from ${edu.institution} (${edu.start_date} - ${edu.end_date}): ${edu.description}`
      )
      .join("\n")
  }

  // Build resume summary combining all parts
  const resumeParts = []
  if (context.experience) resumeParts.push(`Experience:\n${context.experience}`)
  if (context.education) resumeParts.push(`Education:\n${context.education}`)
  if (parsed.skills) {
    const allSkills = [
      ...(parsed.skills.technical || []),
      ...(parsed.skills.soft || []),
      ...(parsed.skills.other || []),
    ]
    if (allSkills.length > 0) {
      resumeParts.push(`Skills: ${allSkills.join(", ")}`)
    }
  }
  context.resume = resumeParts.join("\n\n")

  return context
}

/**
 * Fetch a single document (client-side) for cases where we want to use Supabase directly
 * instead of the REST API detail route.
 * The app currently relies on the dedicated API route:
 * [`app/api/documents/[id]/route.ts`](app/api/documents/[id]/route.ts:1)
 */
export async function getDocumentById(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single()

  if (error) throw error
  return data as Document
}

export async function uploadDocument(file: File) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("Not authenticated")

  const fileName = `${user.id}/${Date.now()}_${file.name}`

  const {
    error: uploadError,
  } = await supabase.storage.from("documents").upload(fileName, file)

  if (uploadError) throw uploadError

  const {
    data: { publicUrl },
  } = supabase.storage.from("documents").getPublicUrl(fileName)

  const { data, error } = await supabase
    .from("documents")
    .insert([
      {
        user_id: user.id,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        file_size: file.size,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data as Document
}

export async function deleteDocument(id: string, fileUrl: string) {
  const supabase = createClient()

  const urlParts = fileUrl.split("/")
  const filePath = urlParts.slice(-2).join("/")

  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([filePath])

  if (storageError)
    console.error("Storage deletion error:", storageError)

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)

  if (error) throw error
}

/**
 * Legacy helper retained for compatibility.
 * For AI analysis & summary we now prefer backend routes which:
 * - enforce auth/ownership via RLS
 * - update analysis_status / parsed_at / summary, etc.
 */
export async function updateDocumentParsedData(id: string, parsedData: ParsedDocument) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("documents")
    .update({ parsed_data: parsedData })
    .eq("id", id)
    .select()
    .single()

  if (error) throw error
  return data as Document
}
