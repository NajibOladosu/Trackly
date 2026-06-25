import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { resetInterviewSession, getInterviewSession } from '@/modules/interviews/services/interview.service'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Auth error in reset route:', authError)
      return NextResponse.json({ error: 'Unauthorized', details: authError?.message }, { status: 401 })
    }

    const rateLimitResponse = await rateLimitMiddleware(request, RATE_LIMITS.general, async () => user.id)
    if (rateLimitResponse) return rateLimitResponse

    const body = await request.json()
    const { sessionId } = body
    console.log("Reset API received request for session:", sessionId)

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing required field: sessionId' },
        { status: 400 }
      )
    }

    // Verify ownership
    const session = await getInterviewSession(sessionId, supabase)
    if (session.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Reset session
    const updatedSession = await resetInterviewSession(sessionId, supabase)

    return NextResponse.json({ session: updatedSession }, { status: 200 })
  } catch (error) {
    console.error('Error resetting interview session:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
