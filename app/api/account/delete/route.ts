import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/db/supabase/server";
import { rateLimitMiddleware, RATE_LIMITS } from "@/lib/middleware/rate-limit";

/**
 * Secure account deletion endpoint.
 *
 * Flow:
 * 1. Verify user is authenticated
 * 2. Delete all user data from public.users (cascades to applications, documents, etc.)
 * 3. Delete the auth user from auth.users using service role key
 * 4. Sign out the user
 *
 * IMPORTANT:
 * - Verifies the user is authenticated before deletion (prevents arbitrary deletion)
 * - Uses service role key to delete auth.users (required for auth deletion)
 * - Cascading deletes handle cleanup of related data
 */

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🗑️  ACCOUNT DELETION STARTED`);
  console.log(`${'='.repeat(60)}`);

  try {
    console.log(`1️⃣  Creating Supabase client...`);
    const supabase = await createClient();
    console.log(`   ✓ Supabase client created`);

    // Verify user is authenticated
    console.log(`2️⃣  Verifying authentication...`);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error(`   ✗ Auth error:`, authError);
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    if (!user) {
      console.error(`   ✗ No user found`);
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userId = user.id;
    console.log(`   ✓ User authenticated: ${userId}`);

    const rateLimitResponse = await rateLimitMiddleware(request, RATE_LIMITS.auth, async () => userId);
    if (rateLimitResponse) return rateLimitResponse;

    // Step 1: Delete from public.users; cascades will remove related data
    console.log(`3️⃣  Deleting user profile and related data...`);
    const { error: deleteUserError } = await supabase
      .from("users")
      .delete()
      .eq("id", userId);

    if (deleteUserError) {
      console.error(`   ✗ Database deletion error:`, deleteUserError);
      return NextResponse.json(
        { error: "Failed to delete account" },
        { status: 500 }
      );
    }

    console.log(`   ✓ User profile deleted from public.users`);

    // Step 2: Delete from auth.users using service role key
    // This is required to actually remove the auth user from Supabase Auth
    console.log(`4️⃣  Deleting auth user...`);

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    console.log(`   Environment variables:`);
    console.log(`   - SUPABASE_SERVICE_ROLE_KEY: ${serviceRoleKey ? '✓ configured' : '✗ MISSING'}`);
    console.log(`   - NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✓' : '✗ MISSING'}`);

    if (!serviceRoleKey) {
      console.error(`   ✗ SUPABASE_SERVICE_ROLE_KEY not configured!`);
      return NextResponse.json(
        { error: "Account deletion failed: service role key not configured" },
        { status: 500 }
      );
    }

    if (!supabaseUrl) {
      console.error(`   ✗ NEXT_PUBLIC_SUPABASE_URL not configured!`);
      return NextResponse.json(
        { error: "Account deletion failed: Supabase URL not configured" },
        { status: 500 }
      );
    }

    try {
      console.log(`   Calling REST API endpoint...`);

      // Use Supabase REST API directly to delete the auth user
      const deleteUrl = `${supabaseUrl}/auth/v1/admin/users/${userId}`;
      console.log(`   URL: ${deleteUrl}`);
      console.log(`   Method: DELETE`);

      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
        },
      });

      console.log(`   ✓ Fetch request sent`);
      console.log(`   Response status: ${deleteResponse.status} ${deleteResponse.statusText}`);

      let deleteData = null;
      const contentType = deleteResponse.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        try {
          deleteData = await deleteResponse.json();
          console.log(`   Response body:`, JSON.stringify(deleteData));
        } catch {
          console.log(`   Response body: (failed to parse as JSON)`);
        }
      } else {
        console.log(`   Response body: (non-JSON response)`);
      }

      if (!deleteResponse.ok) {
        const errorMsg = deleteData?.message || deleteData?.error_description || deleteResponse.statusText;
        console.error(`   ✗ Auth deletion FAILED:`);
        console.error(`     Status: ${deleteResponse.status}`);
        console.error(`     Message: ${errorMsg}`);
        return NextResponse.json(
          { error: `Failed to delete auth user: ${errorMsg || 'Unknown error'}` },
          { status: 500 }
        );
      } else {
        console.log(`   ✓ Auth user deleted from auth.users table`);
      }
    } catch (adminErr) {
      console.error(`   ✗ Exception during auth deletion:`, adminErr);
      if (adminErr instanceof Error) {
        console.error(`     Message: ${adminErr.message}`);
        console.error(`     Name: ${adminErr.name}`);
      }
      return NextResponse.json(
        { error: `Failed to delete auth user: ${adminErr instanceof Error ? adminErr.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Step 3: Sign out the user (clear cookies)
    console.log(`5️⃣  Signing out user...`);
    try {
      await supabase.auth.signOut();
      console.log(`   ✓ User signed out`);
    } catch (signOutErr) {
      console.error(`   ⚠️  Sign out failed (non-critical):`, signOutErr);
    }

    console.log(`${'='.repeat(60)}`);
    console.log(`✅ ACCOUNT DELETION COMPLETE`);
    console.log(`${'='.repeat(60)}`);

    return NextResponse.json({
      success: true,
      message: "Account deleted successfully"
    });
  } catch (error) {
    console.error(`\n❌ UNEXPECTED ERROR:`, error);
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    }
    return NextResponse.json(
      { error: "Unexpected error deleting account" },
      { status: 500 }
    );
  }
}