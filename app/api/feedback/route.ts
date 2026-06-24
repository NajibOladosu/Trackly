/**
 * Feedback API Route
 * POST /api/feedback - Submit new feedback
 * GET /api/feedback - Get user's feedback (for future use)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServerClient } from '@/shared/db/supabase/server'
import { sendEmail } from '@/shared/infrastructure/email'
import { feedbackNotificationTemplate, feedbackNotificationSubject } from '@/shared/infrastructure/email/templates/feedback-notification'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import { validateString, MAX_LENGTHS } from '@/lib/validation'
import type { FeedbackType } from '@/types/database'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResponse = await rateLimitMiddleware(request, RATE_LIMITS.general, async () => user.id)
    if (rateLimitResponse) return rateLimitResponse

    // Parse request body
    const { type, title, description } = await request.json()

    // Validate input
    if (!type || !title || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: type, title, description' },
        { status: 400 }
      )
    }

    const validTypes: FeedbackType[] = ['general', 'bug', 'feature']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid feedback type' },
        { status: 400 }
      )
    }

    const titleErr = validateString(title, 'title', { maxLength: MAX_LENGTHS.feedbackTitle })
    if (titleErr) return NextResponse.json({ error: titleErr }, { status: 400 })

    const descErr = validateString(description, 'description', { maxLength: MAX_LENGTHS.feedbackDescription })
    if (descErr) return NextResponse.json({ error: descErr }, { status: 400 })

    // Get user profile for email
    const { data: userProfile } = await supabase
      .from('users')
      .select('email, name')
      .eq('id', user.id)
      .single()

    // Insert feedback into database
    const { data: feedback, error: insertError } = await supabase
      .from('feedback')
      .insert({
        user_id: user.id,
        type,
        title,
        description,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting feedback:', insertError)
      return NextResponse.json(
        { error: 'Failed to submit feedback' },
        { status: 500 }
      )
    }

    // Send email notification to admin
    try {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER
      if (adminEmail) {
        const emailData = {
          userEmail: user.email || 'Unknown',
          userName: userProfile?.name || user.email || 'Anonymous User',
          feedbackType: type as FeedbackType,
          title,
          description,
          submittedAt: new Date(),
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const htmlBody = feedbackNotificationTemplate(emailData, appUrl)
        const subject = feedbackNotificationSubject(type)

        try {
          await sendEmail({ to: adminEmail, subject, html: htmlBody, from: 'support' })
        } catch (err) {
          console.warn('Failed to send feedback notification email:', err)
          // Don't fail the request if email fails - feedback was still submitted
        }
      }
    } catch (emailError) {
      console.error('Error sending feedback notification email:', emailError)
      // Don't fail the request if email fails - feedback was still submitted
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Feedback submitted successfully',
        feedback,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Feedback route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
