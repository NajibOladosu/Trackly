import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/shared/db/supabase/server"
import { docxBufferToTipTap } from "@/lib/editor/docx-import"
import { rateLimitMiddleware, RATE_LIMITS } from "@/lib/middleware/rate-limit"
import { isOwnedStorageUrl } from "@/lib/security/url-validator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * Given a documentId, fetches the original DOCX from Supabase Storage and
 * returns a TipTap JSON document. RLS guarantees the user can only access
 * their own files. We use the service-side client to read the storage bucket
 * after we have verified ownership of the documents row.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const rateLimitResponse = await rateLimitMiddleware(req, RATE_LIMITS.upload, async () => user.id)
        if (rateLimitResponse) return rateLimitResponse

        const { documentId } = await req.json()
        if (!documentId) {
            return new NextResponse("Missing documentId", { status: 400 })
        }

        const { data: doc, error: docError } = await supabase
            .from("documents")
            .select("id, file_url, file_type, user_id")
            .eq("id", documentId)
            .single()

        if (docError || !doc) {
            return new NextResponse("Document not found", { status: 404 })
        }
        if (doc.user_id !== user.id) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const isDocx =
            (doc.file_type ?? "").includes("wordprocessingml.document") ||
            (doc.file_type ?? "").includes("msword") ||
            (doc.file_url ?? "").toLowerCase().endsWith(".docx") ||
            (doc.file_url ?? "").toLowerCase().endsWith(".doc")

        if (!isDocx) {
            return new NextResponse("Document is not a DOCX file", { status: 400 })
        }

        if (!isOwnedStorageUrl(doc.file_url)) {
            return new NextResponse("Document file URL is not from a trusted storage host", { status: 400 })
        }

        const fileResponse = await fetch(doc.file_url)
        if (!fileResponse.ok) {
            return new NextResponse(`Failed to fetch document: ${fileResponse.status}`, {
                status: 502,
            })
        }
        const arrayBuffer = await fileResponse.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const json = await docxBufferToTipTap(buffer)

        return NextResponse.json({ contentJson: json })
    } catch (error) {
        console.error("[DOCX Import] Error:", error)
        return new NextResponse(
            JSON.stringify({ error: "DOCX import failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        )
    }
}
