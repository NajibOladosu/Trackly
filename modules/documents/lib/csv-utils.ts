import type { ApplicationStatus, ApplicationPriority, ApplicationType } from '@/types/database'

export interface ParsedApplication {
  title: string
  company?: string
  url?: string
  status?: ApplicationStatus
  priority?: ApplicationPriority
  type?: ApplicationType
  deadline?: string
  job_description?: string
}

export interface ImportValidationResult {
  valid: true
  applications: ParsedApplication[]
  rowCount: number
  errorCount: number
  errors: Array<{
    row: number
    errors: string[]
  }>
}

export interface ImportValidationError {
  valid: false
  error: string
}

// Map common column name variations to standard field names
const COLUMN_MAPPING: Record<string, string[]> = {
  title: ['title', 'position', 'job title', 'position title', 'job name', 'role', 'position name'],
  company: ['company', 'company name', 'employer', 'organization', 'org', 'company/organization', 'university', 'company/university', 'school', 'institution'],
  url: ['url', 'link', 'application url', 'application link', 'company website', 'job url', 'job link'],
  status: ['status', 'application status', 'state'],
  priority: ['priority', 'importance', 'urgency'],
  type: ['type', 'application type', 'category', 'job type', 'position type'],
  deadline: ['deadline', 'due date', 'due', 'application deadline', 'closing date', 'end date', 'date'],
  notes: ['notes', 'description', 'job description', 'details', 'comments', 'remarks'],
}

function normalizeColumnName(name: string): string | null {
  const normalized = name.toLowerCase().trim()

  for (const [fieldName, variations] of Object.entries(COLUMN_MAPPING)) {
    if (variations.includes(normalized)) {
      return fieldName
    }
  }

  return null
}

function mapHeaders(csvHeaders: string[]): Record<string, number> {
  const headerMap: Record<string, number> = {}

  csvHeaders.forEach((header, index) => {
    const normalized = normalizeColumnName(header)
    if (normalized) {
      headerMap[normalized] = index
    }
  })

  return headerMap
}

function parseCSV(csvText: string): { headers: string[]; rows: string[][] } | null {
  try {
    const lines = csvText.trim().split('\n')
    if (lines.length === 0) return null

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
    const rows: string[][] = []

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue

      // Handle quoted values with commas
      const row = parseCSVLine(lines[i])
      if (row.length > 0) {
        rows.push(row)
      }
    }

    return { headers, rows }
  } catch {
    return null
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let insideQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        insideQuotes = !insideQuotes
      }
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''))
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim().replace(/^["']|["']$/g, ''))
  return result
}

function parseDate(dateString: string): string | null {
  if (!dateString) return null

  try {
    const date = new Date(dateString)
    if (!isNaN(date.getTime())) {
      return date.toISOString()
    }
  } catch {
    return null
  }

  return null
}

function isValidStatus(status: string): status is ApplicationStatus {
  return ['draft', 'submitted', 'in_review', 'interview', 'offer', 'rejected'].includes(status.toLowerCase())
}

function isValidPriority(priority: string): priority is ApplicationPriority {
  return ['low', 'medium', 'high'].includes(priority.toLowerCase())
}

function isValidType(type: string): type is ApplicationType {
  return ['job', 'scholarship', 'internship', 'other'].includes(type.toLowerCase())
}

export function validateCSV(csvText: string): ImportValidationResult | ImportValidationError {
  const parsed = parseCSV(csvText)

  if (!parsed) {
    return { valid: false, error: 'Invalid CSV format' }
  }

  const { headers, rows } = parsed

  if (headers.length === 0) {
    return { valid: false, error: 'CSV has no headers' }
  }

  const headerMap = mapHeaders(headers)

  if (!headerMap['title']) {
    return { valid: false, error: 'CSV must have a "title" or "position" column' }
  }

  const applications: ParsedApplication[] = []
  const errors: Array<{ row: number; errors: string[] }> = []

  rows.forEach((row, rowIndex) => {
    const rowNum = rowIndex + 2 // +1 for header, +1 for 1-based indexing
    const rowErrors: string[] = []
    let application: ParsedApplication | null = null

    // Extract and validate title (required)
    const titleIndex = headerMap['title']
    const title = row[titleIndex]?.trim()

    if (!title) {
      rowErrors.push('Missing required "title" field')
    } else {
      // Title is valid, start building the application
      application = {
        title,
      }

      // Company (optional)
      if (headerMap['company'] !== undefined) {
        const company = row[headerMap['company']]?.trim()
        if (company) {
          application.company = company
        }
      }

      // URL (optional)
      if (headerMap['url'] !== undefined) {
        const url = row[headerMap['url']]?.trim()
        if (url) {
          // Basic URL validation
          try {
            new URL(url)
            application.url = url
          } catch {
            if (url) {
              rowErrors.push(`Invalid URL: "${url}"`)
            }
          }
        }
      }

      // Status (optional)
      if (headerMap['status'] !== undefined) {
        const status = row[headerMap['status']]?.trim().toLowerCase()
        if (status) {
          if (isValidStatus(status)) {
            application.status = status
          } else {
            rowErrors.push(`Invalid status "${status}". Must be one of: draft, submitted, in_review, interview, offer, rejected`)
          }
        }
      }

      // Priority (optional)
      if (headerMap['priority'] !== undefined) {
        const priority = row[headerMap['priority']]?.trim().toLowerCase()
        if (priority) {
          if (isValidPriority(priority)) {
            application.priority = priority
          } else {
            rowErrors.push(`Invalid priority "${priority}". Must be one of: low, medium, high`)
          }
        }
      }

      // Type (optional)
      if (headerMap['type'] !== undefined) {
        const type = row[headerMap['type']]?.trim().toLowerCase()
        if (type) {
          if (isValidType(type)) {
            application.type = type
          } else {
            rowErrors.push(`Invalid type "${type}". Must be one of: job, scholarship, internship, other`)
          }
        }
      }

      // Deadline (optional)
      if (headerMap['deadline'] !== undefined) {
        const deadline = row[headerMap['deadline']]?.trim()
        if (deadline) {
          const parsed = parseDate(deadline)
          if (parsed) {
            application.deadline = parsed
          } else {
            rowErrors.push(`Invalid deadline date "${deadline}". Use format like "2024-12-31" or "December 31, 2024"`)
          }
        }
      }

      // Job Description/Notes (optional)
      if (headerMap['notes'] !== undefined) {
        const jobDescription = row[headerMap['notes']]?.trim()
        if (jobDescription) {
          application.job_description = jobDescription
        }
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, errors: rowErrors })
    } else if (application) {
      applications.push(application)
    }
  })

  return {
    valid: true,
    applications,
    rowCount: rows.length,
    errorCount: errors.length,
    errors,
  }
}

export function generateCSVTemplate(): string {
  const headers = ['Title', 'Company/University', 'URL', 'Status', 'Priority', 'Type', 'Deadline', 'Notes']
  const sampleRows = [
    [
      'Software Engineer',
      'Google',
      'https://careers.google.com/jobs/123',
      'submitted',
      'high',
      'job',
      '2024-12-31',
      'Full-stack role in Mountain View',
    ],
    [
      'Product Manager',
      'Stripe',
      'https://stripe.com/jobs/456',
      'interview',
      'high',
      'job',
      '2025-01-15',
      'Fintech payments team',
    ],
    [
      'Graduate Fellowship',
      'MIT',
      '',
      'draft',
      'medium',
      'scholarship',
      '2025-02-28',
      'Research fellowship in Computer Science',
    ],
  ]

  const rows = [headers, ...sampleRows]

  return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
}
