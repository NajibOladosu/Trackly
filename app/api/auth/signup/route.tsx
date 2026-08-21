/**
 * Custom Signup API Route
 * POST /api/auth/signup
 * Handles email signup with email verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { render } from '@react-email/render';
import VerifyEmailTemplate from '@/emails/verify-email';
import { sendEmail } from '@/shared/infrastructure/email';
import { emailConfig } from '@/shared/infrastructure/email/config';
import crypto from 'crypto';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit';

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for auth endpoints (before authentication since user doesn't exist yet)
    const rateLimitResponse = await rateLimitMiddleware(
      request,
      RATE_LIMITS.auth,
      async () => undefined
    )
    if (rateLimitResponse) return rateLimitResponse

    const { email, password, name } = await request.json();

    // Validate input
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, name' },
        { status: 400 }
      );
    }

    console.log(`📝 Signing up user: ${email}`);

    // Get Supabase admin client for user creation without auto-sending confirmation email
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const adminClient = createAdminClient(supabaseUrl, supabaseServiceKey);

    // Try to create user with admin API (doesn't send confirmation email automatically)
    let data: { user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null };
    let userExisted = false;

    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // Don't auto-confirm - user must verify with our custom link
      user_metadata: {
        name,
      },
    });

    // If user already exists in auth, handle re-registration case
    if (createError && createError.message.includes('already')) {
      console.log(`⚠️ User already exists: ${email}, checking verification status...`);
      userExisted = true;

      // Check if user is verified in our database
      const { data: existingUsers, error: checkError } = await adminClient
        .from('users')
        .select('id, email_verified')
        .eq('email', email)
        .limit(1);

      if (checkError || !existingUsers || existingUsers.length === 0) {
        console.error('❌ Could not check existing user:', checkError);
        return NextResponse.json(
          { error: 'Account already exists. Please log in.' },
          { status: 400 }
        );
      }

      const existingUser = existingUsers[0];

      // If user is already verified, don't allow re-registration
      if (existingUser.email_verified) {
        console.log(`❌ User already verified: ${email}`);
        return NextResponse.json(
          { error: 'Email already registered. Please log in.' },
          { status: 400 }
        );
      }

      // User exists but not verified - allow re-sending verification email
      console.log(`✅ User exists but unverified: ${email}, will send new verification email`);
      data = { user: { id: existingUser.id } };
    } else if (createError) {
      console.error('❌ User creation error:', createError);
      return NextResponse.json(
        { error: createError.message },
        { status: 400 }
      );
    } else {
      data = createData;
    }

    if (!data.user?.id) {
      console.error('❌ No user ID available');
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    console.log(`✅ User ${userExisted ? 're-registration' : 'created'}: ${email}`);

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Store verification token in database (using admin client to bypass RLS)
    try {
      const { error: updateError } = await adminClient
        .from('users')
        .update({
          verification_token: verificationToken,
          verification_token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', data.user.id);

      if (updateError) {
        console.error('❌ Failed to store verification token:', updateError);
        return NextResponse.json(
          { error: 'Failed to create user' },
          { status: 500 }
        );
      }
    } catch (dbError) {
      console.error('❌ Database error:', dbError);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    // Send verification email directly (not queued, so it sends immediately)
    try {
      console.log(`📧 Sending verification email to ${email}...`);

      const userName = name || email.split('@')[0];
      const verificationUrl = `${emailConfig.appUrl}/api/auth/verify-email?token=${verificationToken}`;

      // Render React Email template (both HTML and plain text)
      const htmlBody = await render(
        <VerifyEmailTemplate
          userName={userName}
          verificationUrl={verificationUrl}
        />
      );

      const textBody = await render(
        <VerifyEmailTemplate
          userName={userName}
          verificationUrl={verificationUrl}
        />,
        { plainText: true }
      );

      await sendEmail({
        to: email,
        subject: 'Verify your ApplyOS email address',
        html: htmlBody,
        text: textBody,
        from: 'noreply',
      });

      console.log(`✅ Verification email sent to ${email}`);
    } catch (emailError) {
      console.error('⚠️ Failed to send verification email:', emailError);

      // Since we rely on this email for verification, we should probably fail the request
      // or at least inform the user. For now, let's fail to ensure they know something went wrong.
      // But first, let's clean up the user we just created/updated to avoid "zombie" accounts
      // if we created it fresh.

      if (!userExisted) {
        await adminClient.auth.admin.deleteUser(data.user.id);
      }

      return NextResponse.json(
        { error: 'Failed to send verification email. Please check your email settings or try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Signup successful! Please check your email to verify your account.',
        user: {
          id: data.user.id,
          email: data.user.email,
          user_metadata: data.user.user_metadata,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('❌ Signup route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
