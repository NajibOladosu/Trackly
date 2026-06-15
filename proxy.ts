import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Build a per-request CSP using a cryptographic nonce.
 * - script-src: nonce + 'strict-dynamic' (drops 'unsafe-inline' in production)
 * - style-src: keeps 'unsafe-inline' (Next.js streaming inserts inline <style> tags
 *   that cannot all be nonced today; revisit when next/font + next 16 supports it)
 */
function buildCsp(nonce: string, isProd: boolean): string {
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`
    : `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://hvmaerptxgeldviarcuj.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://hvmaerptxgeldviarcuj.supabase.co https://*.supabase.co https://generativelanguage.googleapis.com wss://hvmaerptxgeldviarcuj.supabase.co wss://generativelanguage.googleapis.com",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
  ]

  return directives.join('; ')
}

function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const pathname = request.nextUrl.pathname

  // CSP nonce — propagate to RSC via request header, set CSP header on response
  const nonce = generateNonce()
  const isProd = process.env.NODE_ENV === 'production'
  const csp = buildCsp(nonce, isProd)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  // ============================================================
  // CORS FOR API ROUTES — allowlist (no wildcard)
  // ============================================================
  const allowedOrigins = new Set<string>([
    'https://www.applyos.io',
    'https://applyos.io',
    'https://blog.applyos.io',
  ])
  if (!isProd) {
    allowedOrigins.add('http://localhost:3000')
    allowedOrigins.add('http://localhost:3001')
    allowedOrigins.add('http://blog.localhost:3000')
  }
  const reqOrigin = request.headers.get('origin') || ''
  const allowOrigin = allowedOrigins.has(reqOrigin) ? reqOrigin : ''

  if (pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      const corsHeaders: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Vary': 'Origin',
      }
      if (allowOrigin) {
        corsHeaders['Access-Control-Allow-Origin'] = allowOrigin
        corsHeaders['Access-Control-Allow-Credentials'] = 'true'
      }
      return new NextResponse(null, { status: 204, headers: corsHeaders })
    }
  }

  // ============================================================
  // SUBDOMAIN ROUTING FOR BLOG
  // ============================================================
  // Detect if request is coming from blog.applyos.io subdomain
  // Also support blog.localhost for local development
  const isBlogSubdomain =
    hostname.startsWith('blog.applyos.io') ||
    hostname.startsWith('blog.localhost')

  if (isBlogSubdomain) {
    // Rewrite blog subdomain requests to internal /blog routes
    // blog.applyos.io/ -> /blog
    // blog.applyos.io/post-slug -> /blog/post-slug
    const blogPath = pathname === '/' ? '/blog' : `/blog${pathname}`

    // Create a new URL with the rewritten path
    const url = request.nextUrl.clone()
    url.pathname = blogPath

    // Rewrite (not redirect) to keep the subdomain URL in the browser
    const rewriteResponse = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    })
    rewriteResponse.headers.set('Content-Security-Policy', csp)
    rewriteResponse.headers.set('x-nonce', nonce)
    return rewriteResponse
  }

  // ============================================================
  // MAIN DOMAIN REGULAR APP -> BLOG SUBDOMAIN REDIRECT
  // ============================================================
  // If user visits www.applyos.io/blog/..., redirect to blog.applyos.io/...
  // This is a 301 Permanent Redirect, good for SEO
  if (!isBlogSubdomain && pathname.startsWith('/blog')) {
    const newPath = pathname.replace(/^\/blog/, '') || '/'
    return NextResponse.redirect(new URL(newPath, 'https://blog.applyos.io'), 301)
  }

  // ============================================================
  // MAIN APP ROUTING (existing logic)
  // ============================================================
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // Merge secure cookie settings with Supabase's options
          // Don't override httpOnly or maxAge - let Supabase control these based on client type
          const secureOptions: CookieOptions = {
            ...options,
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            sameSite: (options.sameSite as 'lax' | 'strict' | 'none') || 'lax', // CSRF protection
            path: options.path || '/',
          }

          // Set cookie on both request and response
          // Don't create a new response - it would discard previous cookies!
          request.cookies.set({
            name,
            value,
            ...secureOptions,
          })
          response.cookies.set({
            name,
            value,
            ...secureOptions,
          })
        },
        remove(name: string, options: CookieOptions) {
          // Merge secure cookie settings when removing
          // Don't override httpOnly - let Supabase control this based on client type
          const secureOptions: CookieOptions = {
            ...options,
            secure: process.env.NODE_ENV === 'production',
            sameSite: (options.sameSite as 'lax' | 'strict' | 'none') || 'lax',
            path: options.path || '/',
          }

          // Set cookie on both request and response
          // Don't create a new response - it would discard previous cookies!
          request.cookies.set({
            name,
            value: '',
            ...secureOptions,
          })
          response.cookies.set({
            name,
            value: '',
            ...secureOptions,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes
  const protectedRoutes = ['/dashboard', '/apply', '/applications', '/documents', '/upload', '/notifications', '/profile', '/settings']
  const isProtectedRoute = protectedRoutes.some(route => request.nextUrl.pathname.startsWith(route))

  // Redirect to login if accessing protected route without auth
  if (isProtectedRoute && !user) {
    const loginUrl = new URL('/auth/login', request.url)
    // Preserve the original URL so we can redirect back after login
    loginUrl.searchParams.set('returnTo', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect to dashboard if accessing auth pages while logged in
  // NOTE: We don't redirect from /auth/update-password because users landing there via a recovery link 
  // are already considered "authenticated" by Supabase in order to perform the update.
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth/login') ||
    request.nextUrl.pathname.startsWith('/auth/signup') ||
    request.nextUrl.pathname.startsWith('/auth/forgot-password')

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Redirect to dashboard if authenticated user accesses home page
  if (request.nextUrl.pathname === '/' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Apply comprehensive security headers to all responses
  response.headers.set('X-Frame-Options', 'DENY') // Prevent clickjacking
  response.headers.set('X-Content-Type-Options', 'nosniff') // Prevent MIME type sniffing
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin') // Control referrer information
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()') // Restrict browser features (allow microphone for voice interviews)

  // Add CORS headers for API routes (allowlisted origins only — no wildcard)
  if (pathname.startsWith('/api/')) {
    response.headers.set('Vary', 'Origin')
    if (allowOrigin) {
      response.headers.set('Access-Control-Allow-Origin', allowOrigin)
      response.headers.set('Access-Control-Allow-Credentials', 'true')
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }
  }

  // HSTS (HTTP Strict Transport Security) - only in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload' // Force HTTPS for 1 year
    )
  }

  // CSP + nonce on final response
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-nonce', nonce)

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
