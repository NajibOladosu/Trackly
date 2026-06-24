import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/shared/db/supabase/server"
import { callGeminiWithFallback } from "@/shared/infrastructure/ai"
import { rateLimitMiddleware, RATE_LIMITS } from "@/lib/middleware/rate-limit"

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

        const prompt = `
            You are an expert resume writer and career coach. 
            Improve the following resume block of type "${type}".
            
            Current Content:
            "${content}"
            
            ${analysisFeedback ? `Target Improvements based on Analysis:\n${analysisFeedback}` : ""}
            
            Guidelines:
            - Use strong action verbs.
            - Quantify achievements if possible (use percentages, dollar amounts, or numbers).
            - Keep it concise and professional.
            - Ensure it is ATS-friendly.
            - If it's an experience bullet, make it impactful.
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
