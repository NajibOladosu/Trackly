import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/shared/db/supabase/server"
import { tiptapToDocxBuffer } from "@/lib/editor/docx-export"
import { rateLimitMiddleware, RATE_LIMITS } from "@/lib/middleware/rate-limit"
import type { JSONContent } from "@tiptap/core"

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

        const rateLimitResponse = await rateLimitMiddleware(req, RATE_LIMITS.general, async () => user.id)
        if (rateLimitResponse) return rateLimitResponse

        const body = await req.json()
        const { contentJson, fileName } = body as {
            contentJson?: JSONContent
            fileName?: string
        }

        if (!contentJson) {
            return new NextResponse("Missing contentJson", { status: 400 })
        }

        const buffer = await tiptapToDocxBuffer(contentJson)
        const safeName = (fileName ?? "resume").replace(/\.[^.]+$/, "")

        return new NextResponse(buffer as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": `attachment; filename="${safeName}_edited.docx"`,
                "Cache-Control": "no-store",
            },
        })
    } catch (error) {
        console.error("[DOCX Export] Error:", error)
        return new NextResponse(
            JSON.stringify({ error: "DOCX export failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        )
    }
}
