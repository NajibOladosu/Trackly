import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/shared/db/supabase/server"
import { callGeminiWithFallback } from "@/shared/infrastructure/ai"
import { rateLimitMiddleware, RATE_LIMITS } from "@/lib/middleware/rate-limit"
import { MAX_LENGTHS } from "@/lib/validation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Bulk-apply analysis recommendations to a TipTap resume document.
 *
 * Inputs:
 *   - applicationId: scopes the request and fetches job_description for grounding.
 *   - documentId:    enforces ownership; the AI is told this is a derivative.
 *   - contentJson:   current TipTap JSON document (source of truth in editor).
 *   - recommendations: string[] from analysis output.
 *
 * Output:
 *   - { contentJson: <new TipTap JSON> }
 *   - The model is instructed to preserve structure (paragraph counts, headings,
 *     list items) so a node-by-node diff in the UI is meaningful. Content of
 *     individual nodes is rewritten; new nodes are not introduced.
 */

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const rateLimitResponse = await rateLimitMiddleware(
            req,
            RATE_LIMITS.ai,
            async () => user.id,
        )
        if (rateLimitResponse) return rateLimitResponse

        const { applicationId, documentId, contentJson, recommendations } = await req.json() as {
            applicationId?: string
            documentId?: string
            contentJson?: unknown
            recommendations?: string[]
        }

        if (!applicationId || !documentId || !contentJson) {
            return new NextResponse("Missing required fields", { status: 400 })
        }
        if (!Array.isArray(recommendations) || recommendations.length === 0) {
            return new NextResponse("No recommendations provided", { status: 400 })
        }

        if (recommendations.length > MAX_LENGTHS.MAX_RECOMMENDATIONS) {
            return new NextResponse(
                `Too many recommendations (max ${MAX_LENGTHS.MAX_RECOMMENDATIONS})`,
                { status: 400 }
            )
        }

        const oversizedRec = recommendations.find(
            (r: unknown) => typeof r !== 'string' || r.length > MAX_LENGTHS.recommendation
        )
        if (oversizedRec !== undefined) {
            return new NextResponse(
                `Each recommendation must be a string of at most ${MAX_LENGTHS.recommendation} characters`,
                { status: 400 }
            )
        }

        const { data: app, error: appError } = await supabase
            .from("applications")
            .select("id, user_id, job_description, title, company")
            .eq("id", applicationId)
            .single()

        if (appError || !app) {
            console.error("[Apply Recommendations] application lookup failed:", appError)
            return new NextResponse("Application not found", { status: 404 })
        }
        if (app.user_id !== user.id) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { data: doc, error: docError } = await supabase
            .from("documents")
            .select("id, user_id")
            .eq("id", documentId)
            .single()
        if (docError || !doc || doc.user_id !== user.id) {
            return new NextResponse("Document not found or forbidden", { status: 403 })
        }

        const prompt = `You are an expert resume writer following the Harvard (Mignone Center for Career Success) resume style. Revamp the following TipTap JSON resume to address the analysis recommendations and tailor it to the target role — WITHOUT changing the candidate's actual history. Preserve the document STRUCTURE exactly: same number of nodes, same node types, same ordering, same heading levels, same list lengths. Only change the TEXT inside text nodes. Do NOT add, remove, or reorder nodes.

Target role: ${app.title || "Unknown"}${app.company ? ` at ${app.company}` : ""}
Job description:
${(app.job_description || "").slice(0, 6000)}

Analysis recommendations to address:
${recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}

TRUTHFULNESS RULES (non-negotiable — violating any of these is a failure):
- This is the candidate's real history. Never invent employers, roles, dates, locations, degrees, schools, certifications, projects, or achievements.
- Never fabricate numbers. Only use metrics, percentages, dollar amounts, team sizes, or scale indicators that already appear in the resume. If a bullet has no metric, improve the wording without adding one.
- Understand what the candidate actually did in each role before rewriting it; every rewritten bullet must describe the same underlying work as the original.
- Job titles may be reworded for clarity or alignment with the target role ONLY if the new title has the same meaning, scope, and seniority as the original (e.g. "Web Developer" -> "Frontend Engineer" is fine; "Engineer" -> "Engineering Manager" is not).
- Weave in keywords from the job description naturally (for ATS), but only where the candidate's existing experience genuinely supports them. Never claim a skill, tool, or technology the resume does not already evidence.

STYLE RULES (Harvard resume guidelines):
- Start every experience bullet with a strong action verb (Led, Built, Reduced, Streamlined, Negotiated...). Never "Responsible for" or "Helped with".
- Past tense for previous roles, present tense for the current role.
- No personal pronouns (I, my, we).
- Use the XYZ method where the facts allow: "Accomplished [X] as measured by [Y], by doing [Z]" — but only with a [Y] that already exists in the resume.
- Keep bullets concise (one to two lines), specific, and free of empty buzzwords.

OUTPUT RULES:
- Keep formatting marks (bold/italic/underline) where they were.
- Output ONLY a JSON object with this shape: { "contentJson": <full TipTap JSON document> }
- Do NOT wrap in markdown code fences. Do NOT include any prose outside JSON.

Current TipTap JSON:
${JSON.stringify(contentJson)}
`

        const response = await callGeminiWithFallback(prompt, 'COMPLEX')

        let jsonText = response
        const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (codeBlockMatch) jsonText = codeBlockMatch[1].trim()

        const objectMatch = jsonText.match(/\{[\s\S]*\}\s*$/)
        if (!objectMatch) {
            return new NextResponse("AI returned invalid JSON", { status: 502 })
        }

        let parsed: { contentJson?: { type?: string } }
        try {
            parsed = JSON.parse(objectMatch[0])
        } catch {
            return new NextResponse("AI returned malformed JSON", { status: 502 })
        }

        if (!parsed.contentJson || parsed.contentJson.type !== 'doc') {
            return new NextResponse("AI output missing valid contentJson", { status: 502 })
        }

        return NextResponse.json({ contentJson: parsed.contentJson })
    } catch (error) {
        console.error("[Apply Recommendations] Error:", error)
        return new NextResponse(
            JSON.stringify({ error: "Internal Server Error" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        )
    }
}
