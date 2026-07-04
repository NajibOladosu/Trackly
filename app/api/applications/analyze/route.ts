import { createClient } from '@/shared/db/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { analyzeResumeMatch } from '@/shared/infrastructure/ai'
import { buildContextFromDocument } from '@/modules/documents/services/document.service'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        let supabase
        const authHeader = req.headers.get('Authorization')

        if (authHeader?.startsWith('Bearer ')) {
            supabase = createSupabaseClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                {
                    global: { headers: { Authorization: authHeader } }
                }
            )
        } else {
            supabase = await createClient()
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser()

        console.log('[API Debug] User:', user?.id)
        console.log('[API Debug] Auth Error:', authError)

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized', details: authError }, { status: 401 })
        }

        const rateLimitResponse = await rateLimitMiddleware(req, RATE_LIMITS.ai, async () => user.id)
        if (rateLimitResponse) return rateLimitResponse

        const body = await req.json()
        const { applicationId, documentId } = body

        if (!applicationId || !documentId) {
            return NextResponse.json(
                { error: 'Application ID and Document ID are required' },
                { status: 400 }
            )
        }

        // Parallel fetch using the authenticated supabase client
        const [appResult, docResult] = await Promise.all([
            supabase
                .from('applications')
                .select('*')
                .eq('id', applicationId)
                .single(),
            supabase
                .from('documents')
                .select('*')
                .eq('id', documentId)
                .single()
        ])

        const application = appResult.data
        const document = docResult.data

        if (appResult.error || !application) {
            console.error("Application fetch error", appResult.error)
            return NextResponse.json({ error: 'Application not found or access denied' }, { status: 404 })
        }

        if (docResult.error || !document) {
            console.error("Document fetch error", docResult.error)
            return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 })
        }

        // Ownership check is technically handled by RLS, but explicit check doesn't hurt
        if (application.user_id !== user.id || document.user_id !== user.id) {
            return NextResponse.json({ error: 'Unauthorized access to resources' }, { status: 403 })
        }

        if (!application.job_description) {
            return NextResponse.json(
                { error: 'Application is missing a job description. Please add one to proceed.' },
                { status: 400 }
            )
        }

        // Prepare Resume Text
        let resumeText = ''

        // First try structured context
        const context = buildContextFromDocument(document)
        if (context.resume && context.resume.length > 50) {
            resumeText = context.resume
        }
        // Fallback to raw extracted text if available
        else if (document.extracted_text) {
            resumeText = document.extracted_text
        }

        if (!resumeText || resumeText.length < 50) {
            return NextResponse.json(
                { error: 'Document content is empty or not yet processed. Please ensure the document is analyzed.' },
                { status: 400 }
            )
        }

        // Perform Analysis
        const analysis = await analyzeResumeMatch(resumeText, application.job_description)

        // Save analysis to document_analyses (dedicated table)
        const { error: updateError } = await supabase
            .from('document_analyses')
            .upsert({
                application_id: applicationId,
                document_id: documentId,
                analysis_result: analysis,
                analysis_status: 'success',
                summary_generated_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'application_id, document_id'
            })

        if (updateError) {
            console.error('Failed to save analysis to document_analyses:', updateError)
        }

        // Update application with last used document
        const { error: appUpdateError } = await supabase
            .from('applications')
            .update({
                last_analyzed_document_id: documentId
            })
            .eq('id', applicationId)

        if (appUpdateError) {
            console.error('Failed to update application last analyzed document:', appUpdateError)
        }

        return NextResponse.json({ analysis })

    } catch (error) {
        console.error('Error in resume analysis:', error)
        return NextResponse.json(
            { error: 'Failed to analyze resume' },
            { status: 500 }
        )
    }
}
