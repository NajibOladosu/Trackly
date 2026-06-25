import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/shared/db/supabase/server"
import { parseDocument } from "@/shared/infrastructure/ai"
import { AIRateLimitError } from "@/shared/infrastructure/ai/model-manager"
import RetryQueueService from "@/shared/infrastructure/ai/retry-queue"
import { extractTextFromPDF } from "@/modules/documents/lib/pdf-utils"
import { extractTextFromDOCX } from "@/modules/documents/lib/docx-utils"
import { rateLimitMiddleware, RATE_LIMITS } from "@/lib/middleware/rate-limit"
import {
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  ALLOWED_DOCUMENT_MIME_TYPES,
  verifyFileMagicBytes,
} from "@/lib/validation"

/**
 * Handles document upload + analysis.
 *
 * Flow:
 * - Authenticate user via server-side Supabase.
 * - Read multipart/form-data, accept one or more "files".
 * - For each file:
 *   - Upload to Supabase Storage bucket "documents" under path: user.id/timestamp_filename
 *   - Insert row into public.documents with metadata + public URL.
 *   - Run AI-based parsing via parseDocument() when GEMINI_API_KEY is set.
 *   - Update the document row with parsed_data.
 *
 * Returns:
 * - 200 with an array of created documents on success.
 * - 401 when unauthenticated.
 * - 400/500 on validation or server errors.
 */

export const runtime = "nodejs" // ensure Node runtime for FormData/file handling
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      )
    }

    // Apply rate limiting for upload endpoints
    const rateLimitResponse = await rateLimitMiddleware(
      req,
      RATE_LIMITS.upload,
      async () => user.id
    )
    if (rateLimitResponse) return rateLimitResponse

    const formData = await req.formData()
    const files = formData.getAll("files")

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files uploaded" },
        { status: 400 }
      )
    }

    const createdDocuments: {
      id: string
      file_name: string
      file_url: string
      file_type: string | null
      file_size: number | null
      parsed_data: unknown | null
    }[] = []

    for (const entry of files) {
      if (!(entry instanceof File)) {
        continue
      }

      const file = entry

      // Reject files that exceed the size limit before reading into memory
      if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds the 25 MB size limit` },
          { status: 413 }
        )
      }

      const contentType = (file.type || "").toLowerCase()

      // Reject MIME types not on the allowlist
      const mimeAllowed = [...ALLOWED_DOCUMENT_MIME_TYPES].some((allowed) =>
        contentType.includes(allowed) || allowed.includes(contentType)
      )
      if (contentType && !mimeAllowed) {
        return NextResponse.json(
          { error: `File type "${contentType}" is not supported` },
          { status: 415 }
        )
      }

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      if (!buffer.length) {
        continue
      }

      // Verify the actual file bytes match the claimed MIME type (prevents spoofing)
      if (contentType && !verifyFileMagicBytes(buffer, contentType)) {
        return NextResponse.json(
          { error: `File content does not match its declared type` },
          { status: 415 }
        )
      }

      const safeName = file.name.replace(/[^\w.\-]+/g, "_")
      const path = `${user.id}/${Date.now()}_${safeName}`

      // Extract text from document BEFORE uploading
      let extractedText = ""
      try {
        if (contentType.startsWith("text/") || contentType.includes("json")) {
          extractedText = buffer.toString("utf-8")
        } else if (contentType.includes("application/pdf")) {
          extractedText = await extractTextFromPDF(buffer)
        } else if (
          contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document") ||
          contentType.includes("application/msword")
        ) {
          extractedText = await extractTextFromDOCX(buffer)
        }

        // Truncate if too long (100KB limit)
        if (extractedText.length > 100000) {
          extractedText = extractedText.slice(0, 100000) + "\n...(truncated)"
        }
      } catch (extractError) {
        console.error("Text extraction error:", extractError)
        extractedText = ""
      }

      // Upload to Supabase Storage (documents bucket)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, buffer, {
          contentType: file.type || undefined,
          upsert: false,
        })

      if (uploadError || !uploadData) {
        console.error("Storage upload error:", uploadError)
        continue
      }

      // Get public URL (or you can switch to signed URLs if preferred)
      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(uploadData.path)

      // Insert DB row with extracted text
      const { data: docRow, error: insertError } = await supabase
        .from("documents")
        .insert([
          {
            user_id: user.id,
            file_name: file.name,
            file_url: publicUrl,
            file_type: file.type,
            file_size: file.size,
            extracted_text: extractedText || null,
            analysis_status: "not_analyzed",
          },
        ])
        .select()
        .single()

      if (insertError || !docRow) {
        console.error("Insert document error:", insertError)
        continue
      }

      // Now analyze with AI using the ACTUAL extracted text
      let parsed_data = null

      try {
        if (extractedText && extractedText.trim().length > 0) {
          const parsed = await parseDocument(extractedText)
          if (parsed) {
            parsed_data = parsed
            const { error: updateError } = await supabase
              .from("documents")
              .update({
                parsed_data,
                analysis_status: "success",
                parsed_at: new Date().toISOString(),
              })
              .eq("id", docRow.id)

            if (updateError) {
              console.error("Failed to update parsed_data:", updateError)
            }
          }
        }
      } catch (parseError) {
        // Handle rate limit errors by queuing for retry
        if (parseError instanceof AIRateLimitError) {
          console.warn(
            `[Documents Upload] Rate limit hit, queueing document ${docRow.id} for retry`
          )

          // Mark document as pending analysis
          await supabase
            .from("documents")
            .update({
              analysis_status: "pending_analysis",
              analysis_error: parseError.message,
            })
            .eq("id", docRow.id)

          // Queue for retry
          const retryTime = new Date(parseError.nextAvailableTime)
          await RetryQueueService.queueTask({
            userId: user.id,
            taskType: "parse_document",
            taskData: {
              documentId: docRow.id,
              extractedText,
              fileName: file.name,
            },
            scheduledRetryTime: retryTime,
          })
        } else {
          // Parsing is best-effort; log but do not fail the upload pipeline
          console.error("Error parsing document with AI:", parseError)
          await supabase
            .from("documents")
            .update({
              analysis_status: "failed",
              analysis_error: String(parseError),
            })
            .eq("id", docRow.id)
        }
      }

      createdDocuments.push({
        ...docRow,
        parsed_data: parsed_data ?? docRow.parsed_data ?? null,
      })
    }

    if (createdDocuments.length === 0) {
      return NextResponse.json(
        { error: "Failed to process uploaded documents" },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, documents: createdDocuments },
      { status: 200 }
    )
  } catch (error) {
    console.error("Unexpected upload error:", error)
    return NextResponse.json(
      { error: "Unexpected error while uploading documents" },
      { status: 500 }
    )
  }
}