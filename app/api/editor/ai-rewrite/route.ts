import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/shared/db/supabase/server"
import { callGeminiWithFallback } from "@/shared/infrastructure/ai"
import { rateLimitMiddleware, RATE_LIMITS } from "@/lib/middleware/rate-limit"
import { MAX_LENGTHS } from "@/lib/validation"

const VALID_BLOCK_TYPES = new Set(['h1', 'h2', 'h3', 'paragraph', 'bullet', 'text'])

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const rateLimitResponse = await rateLimitMiddleware(req, RATE_LIMITS.ai, async () => user.id)
        if (rateLimitResponse) return rateLimitResponse

        const { content, type, analysisFeedback } = await req.json()

        if (!content) {
            return new NextResponse("Missing content", { status: 400 })
        }

        if (typeof content !== 'string' || content.length > MAX_LENGTHS.aiRewriteContent) {
            return new NextResponse(
                `content exceeds maximum length of ${MAX_LENGTHS.aiRewriteContent} characters`,
                { status: 400 }
            )
        }

        if (type !== undefined && (typeof type !== 'string' || !VALID_BLOCK_TYPES.has(type))) {
            return new NextResponse('Invalid block type', { status: 400 })
        }

        if (analysisFeedback !== undefined) {
            if (typeof analysisFeedback !== 'string' || analysisFeedback.length > MAX_LENGTHS.analysisFeedback) {
                return new NextResponse(
                    `analysisFeedback exceeds maximum length of ${MAX_LENGTHS.analysisFeedback} characters`,
                    { status: 400 }
                )
            }
        }

        const prompt = `
            You are an expert resume writer following the Harvard (Mignone Center for Career Success) resume style.
            Improve the following resume block of type "${type}".

            Current Content:
            "${content}"

            ${analysisFeedback ? `Target Improvements based on Analysis:\n${analysisFeedback}` : ""}

            Truthfulness rules (non-negotiable):
            - The rewrite must describe the same underlying work or fact as the original. Do not invent achievements, skills, tools, employers, dates, or credentials.
            - Never fabricate numbers. Only keep metrics that already appear in the content; if there is no metric, improve the wording without adding one.

            Style guidelines (Harvard resume style):
            - If it's an experience bullet, start with a strong action verb (never "Responsible for" or "Helped with") and use the XYZ method where the existing facts allow: "Accomplished [X] as measured by [Y], by doing [Z]".
            - Keep verb tense consistent with the original (past for past roles, present for current).
            - No personal pronouns. Concise, specific, and free of empty buzzwords.
            - Ensure it is ATS-friendly.
            - Return ONLY the improved text. No explanations, no quotes, no disclaimers.

            Improved Content:
        `

        const rewritten = await callGeminiWithFallback(prompt, 'SIMPLE')

        return NextResponse.json({ rewritten: rewritten.trim() })
    } catch (error) {
        console.error("AI Rewrite Error:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}
