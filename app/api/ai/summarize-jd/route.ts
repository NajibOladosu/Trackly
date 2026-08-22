import { NextRequest, NextResponse } from "next/server"
import { callGeminiWithFallback } from "@/shared/infrastructure/ai"
import { createClient } from "@/shared/db/supabase/server"
import { rateLimitMiddleware, RATE_LIMITS } from "@/lib/middleware/rate-limit"
import { MAX_LENGTHS } from "@/lib/validation"

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const rateLimitResponse = await rateLimitMiddleware(req, RATE_LIMITS.ai, async () => user.id)
        if (rateLimitResponse) return rateLimitResponse

        const { jobDescription } = await req.json()

        if (!jobDescription) {
            return NextResponse.json({ error: "Missing job description" }, { status: 400 })
        }

        if (typeof jobDescription !== 'string' || jobDescription.length > MAX_LENGTHS.jobDescription) {
            return NextResponse.json(
                { error: `jobDescription exceeds maximum length of ${MAX_LENGTHS.jobDescription} characters` },
                { status: 400 }
            )
        }

        const prompt = `You are an expert career coach. Condense the following job description into a concise, scannable summary that helps a candidate quickly decide whether to apply.

        JOB DESCRIPTION:
        ${jobDescription.substring(0, 6000)}

        Task:
        1. Write a one-sentence summary of the role.
        2. List the key responsibilities (3-6 items).
        3. List the must-have requirements (hard requirements the candidate needs).
        4. List the nice-to-haves (preferred but not required).
        5. List any red flags or warning signs (e.g. vague scope, unrealistic requirements, excessive hours, unpaid work). Use an empty array if none.

        Return ONLY a raw JSON object with this exact structure (no markdown, no explanations):
        {
            "summary": "One sentence summary",
            "keyResponsibilities": ["...", "..."],
            "mustHaves": ["...", "..."],
            "niceToHaves": ["...", "..."],
            "redFlags": ["...", "..."]
        }`

        const response = await callGeminiWithFallback(prompt, 'MEDIUM')

        const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim()

        let data
        try {
            data = JSON.parse(cleanJson)
        } catch {
            console.error('Failed to parse AI response:', cleanJson)
            return NextResponse.json({ error: "Failed to parse AI summary" }, { status: 500 })
        }

        return NextResponse.json(data)

    } catch (e) {
        console.error('Summarize JD error:', e)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
