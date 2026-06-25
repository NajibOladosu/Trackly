import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { createConversationTurn } from '@/modules/interviews/services/conversation.service'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import type { BufferedTurn } from '@/lib/gemini-live/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/interview/live-session/flush
 *
 * Save buffered conversation turns to database
 * Called periodically (every 5-10 turns) during live interview
 *
 * Request body:
 * {
 *   sessionId: string
 *   turns: BufferedTurn[]  // Array of turns to save
 * }
 *
 * Response:
 * {
 *   saved: number  // Number of turns saved
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResponse = await rateLimitMiddleware(request, RATE_LIMITS.general, async () => user.id)
    if (rateLimitResponse) return rateLimitResponse

    // Parse request body
    const body = await request.json()
    const { sessionId, turns } = body

    if (!sessionId || !turns || !Array.isArray(turns)) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, turns' },
        { status: 400 }
      )
    }

    if (turns.length === 0) {
      return NextResponse.json({ saved: 0 }, { status: 200 })
    }

    // Verify session belongs to user
    const { data: session } = await supabase
      .from('interview_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single()

    if (!session || session.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Save turns to database
    let savedCount = 0
    const errors: string[] = []

    for (const turn of turns as BufferedTurn[]) {
      try {
        await createConversationTurn(
          {
            session_id: sessionId,
            turn_number: turn.turn_number,
            speaker: turn.speaker,
            content: turn.content,
            metadata: turn.metadata || undefined,
          },
          supabase
        )
        savedCount++
      } catch (error) {
        console.error(`Failed to save turn ${turn.turn_number}:`, error)
        errors.push(`Turn ${turn.turn_number}: failed to save`)
      }
    }

    console.log(`Flushed ${savedCount}/${turns.length} turns for session ${sessionId}`)

    if (errors.length > 0) {
      return NextResponse.json(
        {
          saved: savedCount,
          errors,
          message: `Saved ${savedCount}/${turns.length} turns with errors`,
        },
        { status: 207 } // Multi-Status
      )
    }

    return NextResponse.json(
      { saved: savedCount },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error flushing conversation turns:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
