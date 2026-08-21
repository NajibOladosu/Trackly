import { NextRequest, NextResponse } from "next/server"
import { callGeminiWithFallback } from "@/shared/infrastructure/ai"
import { createClient } from "@/shared/db/supabase/server"
import { getAnalyzedDocuments, buildContextFromDocument } from "@/modules/documents/services/document.service"
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

        const { jobDescription, documentId } = await req.json()

        if (!jobDescription) {
            return NextResponse.json({ error: "Missing job description" }, { status: 400 })
        }

        if (typeof jobDescription !== 'string' || jobDescription.length > MAX_LENGTHS.jobDescription) {
            return NextResponse.json(
                { error: `jobDescription exceeds maximum length of ${MAX_LENGTHS.jobDescription} characters` },
                { status: 400 }
            )
        }

        let resumeContext = ""

        if (documentId) {
            const { data: doc } = await supabase
                .from('documents')
                .select('*')
                .eq('id', documentId)
                .single()

            if (doc) {
                const context = buildContextFromDocument(doc)
                resumeContext = context.resume || JSON.stringify(doc.parsed_data)
            }
        } else {
            // Fallback to latest analyzed document
            // We use getAnalyzedDocuments from services which typically runs server-side
            const docs = await getAnalyzedDocuments()
            if (docs.length > 0) {
                const context = buildContextFromDocument(docs[0])
                resumeContext = context.resume || ""
            }
        }

        if (!resumeContext) {
            // Try to fetch *any* document if no analyzed one found
            const { data: docs } = await supabase
                .from('documents')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)

            if (docs && docs.length > 0 && docs[0].parsed_data) {
                const context = buildContextFromDocument(docs[0])
                resumeContext = context.resume || JSON.stringify(docs[0].parsed_data)
            }

            if (!resumeContext) {
                return NextResponse.json({ error: "No analyzed resume found. Please upload a resume first." }, { status: 404 })
            }
        }

        const prompt = `You are an expert career coach and ATS optimization specialist. Analyze the match between the following Job Description and Candidate Resume.

        JOB DESCRIPTION:
        ${jobDescription.substring(0, 4000)}

        CANDIDATE RESUME:
        ${resumeContext.substring(0, 4000)}

        Task:
        1. Calculate a match score from 0 to 100 based on skills, experience, and keywords. (Return just the number)
        2. Identify 3-5 specific, actionable tips to improve the resume for this specific job.
        3. List important keywords from the JD that are missing or under-emphasized in the resume.
        4. Write a one-sentence summary of the fit.

        Return ONLY a raw JSON object with this exact structure (no markdown, no explanations):
        {
            "score": number,
            "tips": ["tip 1", "tip 2", ...],
            "missingKeywords": ["keyword1", "keyword2", ...],
            "summary": "One sentence summary"
        }`

        const response = await callGeminiWithFallback(prompt, 'MEDIUM')

        // Clean potential markdown wrapping
        const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim()

        let data
        try {
            data = JSON.parse(cleanJson)
        } catch {
            console.error('Failed to parse AI response:', cleanJson)
            return NextResponse.json({ error: "Failed to parse AI analysis" }, { status: 500 })
        }

        return NextResponse.json(data)

    } catch (e) {
        console.error('Compatibility check error:', e)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
