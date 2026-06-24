import 'server-only'

// ─── Input Length Limits ──────────────────────────────────────────────────────
// Prevents token-stuffing attacks on AI endpoints and unbounded DB writes.

export const MAX_LENGTHS = {
  noteContent: 10_000,
  feedbackTitle: 200,
  feedbackDescription: 5_000,
  answerText: 10_000,
  userAnswer: 10_000,
  jobText: 50_000,
  coverLetterInstructions: 2_000,
  companyName: 200,
  category: 100,
  fileName: 255,
} as const

// ─── Upload Limits ────────────────────────────────────────────────────────────

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 25 * 1024 * 1024 // 25 MB
export const MAX_AUDIO_CHUNKS = 100
// 15 MB base64 ≈ ~11 MB of actual audio — enough for a multi-minute recording
export const MAX_AUDIO_TOTAL_BASE64_CHARS = 15 * 1024 * 1024

// ─── MIME Allowlists ──────────────────────────────────────────────────────────

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'application/json',
])

export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/flac',
])

// ─── Magic Byte Verification ─────────────────────────────────────────────────
// Verifies the actual file content matches the claimed MIME type.
// Defends against content-type spoofing (e.g. executable uploaded as PDF).

export function verifyFileMagicBytes(buffer: Buffer, claimedType: string): boolean {
  if (buffer.length < 4) return false
  const b = buffer

  if (claimedType.includes('application/pdf')) {
    // %PDF
    return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46
  }

  if (
    claimedType.includes('wordprocessingml.document') ||
    claimedType.includes('msword')
  ) {
    // DOCX is a ZIP archive: PK\x03\x04
    const isZip = b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04
    // Legacy .doc uses OLE2 compound format: D0 CF 11 E0
    const isOle = b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0
    return isZip || isOle
  }

  if (claimedType.startsWith('text/') || claimedType.includes('json')) {
    // Text must not contain null bytes in the first 512 bytes
    const sample = buffer.slice(0, Math.min(512, buffer.length))
    return !sample.includes(0x00)
  }

  // Unknown type passes through; ALLOWED_DOCUMENT_MIME_TYPES will catch it
  return true
}

// ─── Field Validation ────────────────────────────────────────────────────────

/**
 * Validates a single string field.
 * Returns an error message string or null if valid.
 */
export function validateString(
  value: unknown,
  fieldName: string,
  opts: { required?: boolean; minLength?: number; maxLength?: number } = {}
): string | null {
  const { required = true, minLength = 0, maxLength } = opts

  if (value === undefined || value === null || value === '') {
    return required ? `${fieldName} is required` : null
  }
  if (typeof value !== 'string') {
    return `${fieldName} must be a string`
  }
  if (minLength > 0 && value.trim().length < minLength) {
    return `${fieldName} must be at least ${minLength} characters`
  }
  if (maxLength !== undefined && value.length > maxLength) {
    return `${fieldName} exceeds maximum length of ${maxLength} characters`
  }
  return null
}

/**
 * Validates a number field.
 * Returns an error message string or null if valid.
 */
export function validateNumber(
  value: unknown,
  fieldName: string,
  opts: { required?: boolean; min?: number; max?: number; integer?: boolean } = {}
): string | null {
  const { required = true, min, max, integer = false } = opts

  if (value === undefined || value === null) {
    return required ? `${fieldName} is required` : null
  }
  if (typeof value !== 'number' || !isFinite(value)) {
    return `${fieldName} must be a number`
  }
  if (integer && !Number.isInteger(value)) {
    return `${fieldName} must be an integer`
  }
  if (min !== undefined && value < min) {
    return `${fieldName} must be at least ${min}`
  }
  if (max !== undefined && value > max) {
    return `${fieldName} must be at most ${max}`
  }
  return null
}

/**
 * Validates that a value is one of a set of allowed enum values.
 * Returns an error message string or null if valid.
 */
export function validateEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
  opts: { required?: boolean } = {}
): string | null {
  const { required = true } = opts

  if (value === undefined || value === null) {
    return required ? `${fieldName} is required` : null
  }
  if (!allowed.includes(value as T)) {
    return `${fieldName} must be one of: ${allowed.join(', ')}`
  }
  return null
}

// ─── Safe Error Responses ────────────────────────────────────────────────────

/**
 * Returns a safe, generic error message for client responses.
 * Use this instead of passing `error.message` directly to prevent
 * leaking internal stack traces, DB errors, or implementation details.
 */
export function safeErrorMessage(fallback: string): string {
  return fallback
}

// ─── Body Parsing ─────────────────────────────────────────────────────────────

/**
 * Safely parses a JSON request body.
 * Returns the parsed object or null on failure (invalid JSON, non-object body).
 */
export async function parseJsonBody(
  request: Request
): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
    return body as Record<string, unknown>
  } catch {
    return null
  }
}
