import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/render'
import ResetPasswordTemplate from '@/emails/reset-password'
import { sendEmail } from '@/shared/infrastructure/email'
import { getEmailConfig } from '@/shared/infrastructure/email/config'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import type { Database } from '@/types/supabase'

export async function POST(request: NextRequest) {
    try {
        const rateLimitResponse = await rateLimitMiddleware(request, RATE_LIMITS.auth)
        if (rateLimitResponse) return rateLimitResponse

        const { email } = await request.json()

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('❌ Missing Supabase environment variables')
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
        }

        const adminClient = createAdminClient<Database>(supabaseUrl, supabaseServiceKey)

        // 1. Get the user's name or fallback to part of email
        const { data: users } = await adminClient
            .from('users')
            .select('name')
            .eq('email', email)
            .limit(1)

        const userRow = (users as unknown as Array<{ name?: string | null }> | null)?.[0]
        const userName = userRow?.name || email.split('@')[0]

        // If no user found, return success immediately to prevent enumeration
        // and strictly ensure we DO NOT send an email
        if (!users || users.length === 0) {
            console.log(`ℹ️ Reset requested for non-existent email: ${email}`)
            return NextResponse.json({ message: 'If an account exists, a reset link has been sent' })
        }

        // 2. Generate recovery link
        // We use process.env.NEXT_PUBLIC_APP_URL for the redirect
        const emailConfig = getEmailConfig()
        const redirectTo = `${emailConfig.appUrl}/auth/update-password`

        const { data, error: linkError } = await adminClient.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: {
                redirectTo,
            },
        })

        if (linkError) {
            console.error('❌ Link generation error:', linkError)
            // We return success even if link generation fails for security (don't reveal if email exists)
            // but in this case, we might want to log it and return a generic success.
            // However, if the user doesn't exist, generateLink returns an error.
            // To prevent email enumeration, we'll return 200 regardless.
            return NextResponse.json({ message: 'If an account exists, a reset link has been sent' })
        }

        const resetUrl = data.properties.action_link

        // 3. Render and send email
        const htmlBody = await render(
            <ResetPasswordTemplate
                userName={userName}
                resetUrl={resetUrl}
            />
        )

        const textBody = await render(
            <ResetPasswordTemplate
                userName={userName}
                resetUrl={resetUrl}
            />,
            { plainText: true }
        )

        await sendEmail({
            to: email,
            subject: 'Reset your ApplyOS password',
            html: htmlBody,
            text: textBody,
            from: 'noreply',
        })

        console.log(`✅ Custom reset email sent to ${email}`)
        return NextResponse.json({ message: 'Reset email sent successfully' })
    } catch (error) {
        console.error('❌ Reset password route error:', error)
        // Check if it's an email error (generic check, can be refined)
        if (error instanceof Error && (error.message.includes('SMTP') || error.message.includes('email'))) {
            return NextResponse.json({ error: 'Failed to send reset email. Please check server logs.' }, { status: 500 })
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
