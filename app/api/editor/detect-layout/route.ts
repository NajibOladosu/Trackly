import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/shared/db/supabase/server"
import { detectPdfLayout } from "@/lib/editor/layout-detect"
import { rateLimitMiddleware, RATE_LIMITS } from "@/lib/middleware/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const rateLimitResponse = await rateLimitMiddleware(req, RATE_LIMITS.ai, async () => user.id)
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

        const fallbackLayout = {
            columnCount: 1,
            hasPhoto: false,
            hasSidebar: false,
            confidence: 0.5,
            suggestedTemplate: 'modern' as const,
        }

        const isPdf =
            (doc.file_type ?? "").includes("pdf") ||
            (doc.file_url ?? "").toLowerCase().endsWith(".pdf")

        if (!isPdf) {
            return NextResponse.json({ layout: fallbackLayout })
        }

        // Storage bucket is private — extract path from public URL and download
        // through the auth'd client instead of fetching the URL directly.
        const url: string = doc.file_url ?? ""
        const marker = "/storage/v1/object/public/documents/"
        const idx = url.indexOf(marker)
        let buffer: Buffer | null = null

        if (idx >= 0) {
            const path = decodeURIComponent(url.slice(idx + marker.length))
            const { data: blob, error: dlErr } = await supabase.storage
                .from("documents")
                .download(path)
            if (!dlErr && blob) {
                buffer = Buffer.from(await blob.arrayBuffer())
            }
        }

        if (!buffer) {
            // Storage path unparseable or download failed; degrade gracefully.
            return NextResponse.json({ layout: fallbackLayout })
        }

        const layout = await detectPdfLayout(buffer)
        return NextResponse.json({ layout })
    } catch (error) {
        console.error("[Layout Detect] Error:", error)
        return new NextResponse(
            JSON.stringify({ error: "Layout detection failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        )
    }
}
