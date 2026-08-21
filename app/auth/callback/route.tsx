import { createClient } from '@/shared/db/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { render } from '@react-email/render'
import VerifyEmailTemplate from '@/emails/verify-email'
import { sendEmail } from '@/shared/infrastructure/email'
import { getEmailConfig } from '@/shared/infrastructure/email/config'

// Rate limit: 5 minutes between verification email sends
const VERIFICATION_EMAIL_RATE_LIMIT_MS = 5 * 60 * 1000

/**
 * Check if enough time has passed since last email send
 */
function isRateLimitOk(lastEmailSent: string | null): boolean {
  if (!lastEmailSent) return true
  const lastSentTime = new Date(lastEmailSent).getTime()
  const now = Date.now()
  return now - lastSentTime >= VERIFICATION_EMAIL_RATE_LIMIT_MS
}

/**
 * Generate and send verification email
 */
async function sendVerificationEmail(
  userId: string,
  email: string,
  userName: string,
  adminClient: SupabaseClient
) {
  try {
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Update user with token and rate limit timestamp
    const { error: updateError } = await adminClient
      .from('users')
      .update({
        verification_token: verificationToken,
        verification_token_expires_at: expiresAt.toISOString(),
        last_verification_email_sent: new Date().toISOString(),
      })
      .eq('id', userId)

    if (updateError) {
      console.error('❌ Failed to store verification token:', updateError)
      return false
    }

    // Send verification email
    const emailConfig = getEmailConfig()
    const verificationUrl = `${emailConfig.appUrl}/api/auth/verify-email?token=${verificationToken}`
    const htmlBody = await render(
      <VerifyEmailTemplate
        userName={userName}
        verificationUrl={verificationUrl}
      />
    )

    const textBody = await render(
      <VerifyEmailTemplate
        userName={userName}
        verificationUrl={verificationUrl}
      />,
      { plainText: true }
    )

    await sendEmail({
      to: email,
      subject: 'Verify your ApplyOS email address',
      html: htmlBody,
      text: textBody,
      from: 'noreply',
    })

    console.log(`✅ Verification email sent to ${email}`)
    return true
  } catch (error) {
    console.error('❌ Failed to send verification email:', error)
    return false
  }
}

export async function GET(request: Request) {
  try {
    console.log('🔐 Auth callback invoked')
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')

    // Parse cookies from request headers
    const cookieHeader = request.headers.get('cookie') || ''
    const cookies = Object.fromEntries(
      cookieHeader
        .split('; ')
        .map(c => c.split('='))
        .filter(([key]) => key)
        .map(([key, value]) => [key, decodeURIComponent(value)])
    )

    // Get intent and returnTo from cookies, with fallbacks to query params for backward compatibility
    const intent = cookies['auth_intent'] || requestUrl.searchParams.get('intent') || 'login'
    const returnToRaw = cookies['auth_returnTo'] ? decodeURIComponent(cookies['auth_returnTo']) : requestUrl.searchParams.get('returnTo')
    // Open-redirect guard: only accept same-origin, single-leading-slash paths (not //evil.com, not full URLs)
    const returnTo =
      returnToRaw && returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') && !returnToRaw.startsWith('/\\')
        ? returnToRaw
        : null

    console.log(`🔐 Auth callback: Code=${code ? 'present' : 'missing'}, Intent=${intent}, ReturnTo=${returnTo || 'none'}`)

    if (!code) {
      console.log('⚠️ No code parameter in callback URL')
      return NextResponse.redirect(new URL('/auth/login', requestUrl.origin + '/'))
    }

    // Create Supabase clients
    const supabase = await createClient()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables')
      return NextResponse.redirect(new URL('/auth/login?error=config', requestUrl.origin + '/'))
    }

    const adminClient = createAdminClient(supabaseUrl, supabaseServiceKey)

    // Exchange code for session
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('❌ Exchange error:', exchangeError)
      return NextResponse.redirect(new URL('/auth/login?error=exchange', requestUrl.origin + '/'))
    }

    const user = data.session?.user

    if (!user) {
      console.error('❌ No user in session')
      return NextResponse.redirect(new URL('/auth/login?error=user', requestUrl.origin + '/'))
    }

    console.log(`👤 User: ${user.email}`)

    // Query existing profile
    const { data: existingProfile, error: profileError } = await adminClient
      .from('users')
      .select('id, email_verified, name, last_verification_email_sent')
      .eq('id', user.id)
      .single()

    if (profileError && profileError.code !== 'PGRST116') {
      // PGRST116 = not found, which is expected for new users
      console.error('❌ Profile query error:', profileError)
    }

    const profileExists = !!existingProfile

    console.log(`📋 Profile exists: ${profileExists}, Verified: ${profileExists ? existingProfile.email_verified : 'n/a'}`)

    // ===== INTENT: SIGNUP =====
    if (intent === 'signup') {
      console.log(`✨ Processing signup for ${user.email}`)

      if (profileExists) {
        if (existingProfile.email_verified) {
          // Already registered and verified - show error
          console.log('ℹ️ User already registered and verified')
          await supabase.auth.signOut()
          return NextResponse.redirect(
            new URL('/auth/signup?error=already_registered', requestUrl.origin + '/')
          )
        } else {
          // Registered but not verified - send verification email and redirect to check-email
          console.log('ℹ️ User registered but not verified - resending verification email')

          // Check rate limit
          if (!isRateLimitOk(existingProfile.last_verification_email_sent)) {
            console.log('⏱️ Rate limit: verification email sent too recently')
            await supabase.auth.signOut()
            return NextResponse.redirect(
              new URL(`/auth/check-email?email=${encodeURIComponent(user.email!)}`, requestUrl.origin + '/')
            )
          }

          const userName = existingProfile.name || user.email!.split('@')[0]
          await sendVerificationEmail(user.id, user.email!, userName, adminClient)

          await supabase.auth.signOut()
          return NextResponse.redirect(
            new URL(`/auth/check-email?email=${encodeURIComponent(user.email!)}`, requestUrl.origin + '/')
          )
        }
      } else {
        // New profile created by trigger - send verification email
        console.log('✨ New OAuth signup - sending verification email')

        const userName = user.user_metadata?.name || user.email!.split('@')[0]
        await sendVerificationEmail(user.id, user.email!, userName, adminClient)

        await supabase.auth.signOut()
        return NextResponse.redirect(
          new URL(`/auth/check-email?email=${encodeURIComponent(user.email!)}`, requestUrl.origin + '/')
        )
      }
    }

    // ===== INTENT: RECOVERY =====
    if (intent === 'recovery') {
      console.log(`✨ Processing password recovery for ${user.email}`)
      // Session is already established by exchangeCodeForSession above
      // Just redirect to the update password page
      return NextResponse.redirect(new URL('/auth/update-password', requestUrl.origin + '/'))
    }

    // ===== INTENT: LOGIN =====
    if (intent === 'login') {
      if (!profileExists) {
        // No account found - delete the auth.users record created by trigger
        console.log(`❌ Login failed: No profile found for ${user.email}`)

        try {
          await adminClient.auth.admin.deleteUser(user.id)
          console.log('✓ Auth user deleted')
        } catch (deleteError) {
          console.error('⚠️ Failed to delete auth user:', deleteError)
          // Continue anyway, just let them see the error message
        }

        await supabase.auth.signOut()
        return NextResponse.redirect(
          new URL('/auth/login?error=no_account', requestUrl.origin + '/')
        )
      }

      if (!existingProfile.email_verified) {
        // Profile exists but not verified - send verification email and redirect
        console.log('ℹ️ Login with unverified account - sending verification email')

        // Check rate limit
        if (!isRateLimitOk(existingProfile.last_verification_email_sent)) {
          console.log('⏱️ Rate limit: verification email sent too recently')
          await supabase.auth.signOut()
          return NextResponse.redirect(
            new URL(`/auth/check-email?email=${encodeURIComponent(user.email!)}`, requestUrl.origin + '/')
          )
        }

        const userName = existingProfile.name || user.email!.split('@')[0]
        await sendVerificationEmail(user.id, user.email!, userName, adminClient)

        await supabase.auth.signOut()
        return NextResponse.redirect(
          new URL(`/auth/check-email?email=${encodeURIComponent(user.email!)}`, requestUrl.origin + '/')
        )
      }

      // Profile exists and verified - keep signed in and redirect to original page or dashboard
      const finalRedirectPath = returnTo || '/dashboard'
      // Use the request origin to ensure we stay on the correct domain (Vercel, localhost, etc)
      const finalRedirectUrl = new URL(finalRedirectPath, requestUrl.origin + '/')
      console.log(`✅ Login successful - redirecting to ${finalRedirectUrl.toString()}`)

      // Create response with redirect
      const response = NextResponse.redirect(finalRedirectUrl)

      // Clear the auth cookies
      response.cookies.delete('auth_intent')
      response.cookies.delete('auth_returnTo')

      return response
    }

    // Fallback
    console.log('⚠️ Unknown intent, redirecting to dashboard')
    const fallbackResponse = NextResponse.redirect(new URL('/dashboard', requestUrl.origin + '/'))
    fallbackResponse.cookies.delete('auth_intent')
    fallbackResponse.cookies.delete('auth_returnTo')
    return fallbackResponse
  } catch (error) {
    console.error('❌ Callback route error:', error)
    // Try to extract origin from request URL, fallback to localhost
    let origin = 'http://localhost:3000'
    try {
      const requestUrl = new URL(request.url)
      origin = requestUrl.origin
    } catch {
      // If URL parsing fails, use default
    }
    const errorResponse = NextResponse.redirect(new URL('/auth/login?error=callback', origin + '/'))
    errorResponse.cookies.delete('auth_intent')
    errorResponse.cookies.delete('auth_returnTo')
    return errorResponse
  }
}
