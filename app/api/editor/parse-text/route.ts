import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/shared/db/supabase/server"
import { callGeminiWithFallback } from "@/shared/infrastructure/ai"
import { rateLimitMiddleware, RATE_LIMITS } from "@/lib/middleware/rate-limit"
import { MAX_LENGTHS } from "@/lib/validation"

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const rateLimitResponse = await rateLimitMiddleware(req, RATE_LIMITS.ai, async () => user.id)
        if (rateLimitResponse) return rateLimitResponse

        const { extractedText } = await req.json()

        if (!extractedText) {
            return new NextResponse("Missing extractedText", { status: 400 })
        }

        if (typeof extractedText !== 'string' || extractedText.length > MAX_LENGTHS.extractedText) {
            return new NextResponse(
                `extractedText exceeds maximum length of ${MAX_LENGTHS.extractedText} characters`,
                { status: 400 }
            )
        }

        const prompt = `You are a resume formatting expert. The following text was extracted from a PDF resume (possibly LaTeX-generated), and the formatting is messy.

Your task: Convert this into a clean, structured JSON array of resume blocks that preserves ALL the original content but organizes it properly.

Extracted Text:
${extractedText}

Return ONLY valid JSON in this exact format (no markdown, no code fences):
{
  "blocks": [
    { "type": "h1", "content": "Full Name", "styles": { "align": "center", "bold": true } },
    { "type": "paragraph", "content": "email@example.com | phone | location", "styles": { "align": "center" } },
    { "type": "h2", "content": "Professional Summary", "styles": { "bold": true } },
    { "type": "paragraph", "content": "Summary text here..." },
    { "type": "h2", "content": "Experience", "styles": { "bold": true } },
    { "type": "h3", "content": "Job Title at Company Name", "styles": { "bold": true } },
    { "type": "paragraph", "content": "Jan 2020 - Present | Location", "styles": { "italic": true } },
    { "type": "bullet", "content": "Achievement or responsibility" },
    { "type": "h2", "content": "Education", "styles": { "bold": true } },
    { "type": "paragraph", "content": "Degree - University Name", "styles": { "bold": true } },
    { "type": "h2", "content": "Skills", "styles": { "bold": true } },
    { "type": "paragraph", "content": "Skill1 • Skill2 • Skill3" }
  ]
}

Rules:
- Include ALL content from the original text
- Use "h1" for the person's name
- Use "h2" for section headers (Experience, Education, Skills, etc.)
- Use "h3" for job titles or degree names
- Use "paragraph" for dates, descriptions, or general text
- Use "bullet" for individual achievements/responsibilities
- Preserve the logical order and grouping
- Clean up any garbled text or formatting artifacts
- If contact info is on multiple lines, combine into one paragraph with " | " separators
- Return ONLY the JSON object, nothing else`

        const response = await callGeminiWithFallback(prompt, 'COMPLEX')

        let jsonText = response.trim()
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (codeBlockMatch) {
            jsonText = codeBlockMatch[1].trim()
        }

        const start = jsonText.indexOf("{")
        const end = jsonText.lastIndexOf("}")
        if (start === -1 || end === -1 || end <= start) {
            console.error("[parse-text] No JSON object in response:", jsonText.slice(0, 200))
            return NextResponse.json({ blocks: [] })
        }

        let parsed: { blocks?: unknown }
        try {
            parsed = JSON.parse(jsonText.slice(start, end + 1))
        } catch (parseErr) {
            console.error("[parse-text] JSON parse failed:", parseErr)
            return NextResponse.json({ blocks: [] })
        }

        if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
            return NextResponse.json({ blocks: [] })
        }

        return NextResponse.json(parsed)
    } catch (error) {
        console.error("AI Parse Error:", error)
        return NextResponse.json({ blocks: [] }, { status: 200 })
    }
}
