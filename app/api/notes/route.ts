import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import { validateString, MAX_LENGTHS } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResponse = await rateLimitMiddleware(request, RATE_LIMITS.general, async () => user.id)
    if (rateLimitResponse) return rateLimitResponse

    const applicationId = request.nextUrl.searchParams.get('applicationId')
    if (!applicationId) {
      return NextResponse.json({ error: 'applicationId is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('application_notes')
      .select('*')
      .eq('application_id', applicationId)
      .eq('user_id', user.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching notes:', error)
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResponse = await rateLimitMiddleware(request, RATE_LIMITS.general, async () => user.id)
    if (rateLimitResponse) return rateLimitResponse

    const body = await request.json()
    const { applicationId, content, category, is_pinned } = body

    if (!applicationId || !content) {
      return NextResponse.json({ error: 'applicationId and content are required' }, { status: 400 })
    }

    const contentErr = validateString(content, 'content', { maxLength: MAX_LENGTHS.noteContent })
    if (contentErr) return NextResponse.json({ error: contentErr }, { status: 400 })

    const categoryErr = validateString(category, 'category', { required: false, maxLength: MAX_LENGTHS.category })
    if (categoryErr) return NextResponse.json({ error: categoryErr }, { status: 400 })

    // Verify the application belongs to the user
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('id')
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .single()

    if (appError || !app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('application_notes')
      .insert([{
        application_id: applicationId,
        user_id: user.id,
        content,
        category: category || null,
        is_pinned: is_pinned || false,
      }])
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error creating note:', error)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}
