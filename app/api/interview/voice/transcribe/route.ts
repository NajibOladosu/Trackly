import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { transcribeAudioWithRetry, validateAudioData, AudioProcessingError } from '@/shared/infrastructure/ai-audio'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import {
  MAX_AUDIO_CHUNKS,
  MAX_AUDIO_TOTAL_BASE64_CHARS,
  ALLOWED_AUDIO_MIME_TYPES,
} from '@/lib/validation'

export const dynamic = 'force-dynamic'

/**
 * POST /api/interview/voice/transcribe
 *
 * Transcribe audio chunks using Gemini 2.5 Flash
 *
 * Body:
 * - audioChunks: string[] (Base64 encoded audio chunks)
 * - mimeType: string (e.g., 'audio/webm;codecs=opus')
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting
    const rateLimitResponse = await rateLimitMiddleware(
      request,
      RATE_LIMITS.ai,
      async () => user.id
    )
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const body = await request.json()
    const { audioChunks, mimeType } = body

    // Validation
    if (!audioChunks || !Array.isArray(audioChunks) || audioChunks.length === 0) {
      return NextResponse.json(
        { error: 'audioChunks array is required and must not be empty' },
        { status: 400 }
      )
    }

    if (audioChunks.length > MAX_AUDIO_CHUNKS) {
      return NextResponse.json(
        { error: `Too many audio chunks (max ${MAX_AUDIO_CHUNKS})` },
        { status: 400 }
      )
    }

    if (!mimeType || typeof mimeType !== 'string') {
      return NextResponse.json(
        { error: 'mimeType string is required' },
        { status: 400 }
      )
    }

    // Validate mimeType against allowlist (base type without codec params)
    const baseMime = mimeType.split(';')[0].trim().toLowerCase()
    const mimeAllowed =
      ALLOWED_AUDIO_MIME_TYPES.has(mimeType) ||
      ALLOWED_AUDIO_MIME_TYPES.has(baseMime)
    if (!mimeAllowed) {
      return NextResponse.json(
        { error: 'Unsupported audio format' },
        { status: 415 }
      )
    }

    // Combine audio chunks into single blob
    const combinedAudio = audioChunks.join('')

    // Enforce total payload size limit
    if (combinedAudio.length > MAX_AUDIO_TOTAL_BASE64_CHARS) {
      return NextResponse.json(
        { error: 'Audio payload exceeds maximum allowed size' },
        { status: 413 }
      )
    }

    // Validate audio data
    const validation = validateAudioData(combinedAudio, mimeType)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    // Transcribe audio using Gemini
    try {
      const result = await transcribeAudioWithRetry(combinedAudio, {
        mimeType,
        sampleRate: 24000
      })

      return NextResponse.json({
        transcription: result.text,
        confidence: result.confidence,
        timestamp: result.timestamp,
        chunkCount: audioChunks.length
      })

    } catch (error) {
      if (error instanceof AudioProcessingError) {
        if (error.code === 'RATE_LIMITED') {
          return NextResponse.json(
            { error: 'Too many requests. Please wait a moment and try again.' },
            {
              status: 429,
              headers: { 'Retry-After': '60' }
            }
          )
        }

        if (error.code === 'INVALID_AUDIO') {
          return NextResponse.json(
            { error: error.message },
            { status: 400 }
          )
        }
      }

      throw error
    }

  } catch (error) {
    console.error('[Transcribe] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to transcribe audio' },
      { status: 500 }
    )
  }
}
