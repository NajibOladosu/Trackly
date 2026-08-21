"use client"

import Image from "next/image"
import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { createClient } from "@/shared/db/supabase/client"
import { Chrome } from "lucide-react"

function LoginContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [unverifiedEmail, setUnverifiedEmail] = useState("")
  const [showResendModal, setShowResendModal] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [returnTo, setReturnTo] = useState("")
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const errorParam = searchParams.get('error')
    const returnToParam = searchParams.get('returnTo')

    if (errorParam === 'no_account') {
      setError('No account found. Please sign up first to create an account.')
    }

    if (returnToParam) {
      setReturnTo(returnToParam)
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setUnverifiedEmail("")
    setShowResendModal(false)

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Get user from the sign-in response
    const user = authData.user
    if (!user) {
      setError('Failed to get user information')
      setLoading(false)
      return
    }

    // Check if user's email is verified using Supabase Auth's built-in verification
    // user.email_confirmed_at will be null if email is not verified
    if (!user.email_confirmed_at) {
      // Email not verified - sign out and show modal
      await supabase.auth.signOut()
      setUnverifiedEmail(user.email || email)
      setShowResendModal(true)
      setLoading(false)
      return
    }

    // Email verified - proceed to dashboard
    router.push("/dashboard")
  }

  const handleResendVerification = async () => {
    setResending(true)
    setResendSuccess(false)

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unverifiedEmail }),
      })

      if (response.ok) {
        setResendSuccess(true)
        setTimeout(() => {
          setShowResendModal(false)
          setResendSuccess(false)
          setUnverifiedEmail("")
        }, 3000)
      } else {
        setError('Failed to resend verification email')
      }
    } catch {
      setError('An error occurred')
    } finally {
      setResending(false)
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)

    // Generate a random state to track this OAuth session
    const state = Math.random().toString(36).substring(7)

    // Store intent and returnTo in cookies with SameSite=Lax for better persistence through redirects
    document.cookie = `auth_intent=login; path=/; max-age=3600; SameSite=Lax`
    document.cookie = `auth_state=${state}; path=/; max-age=3600; SameSite=Lax`
    if (returnTo) {
      document.cookie = `auth_returnTo=${encodeURIComponent(returnTo)}; path=/; max-age=3600; SameSite=Lax`
    }

    // Use the environment variable if available, otherwise fall back to window.location.origin
    const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const redirectTo = `${origin}/auth/callback`

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account', // Force Google to show account picker
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Image src="/ApplyOS%20Logo.webp" alt="ApplyOS" width={1073} height={1000} className="h-12 w-auto" />
              <span className="text-3xl font-bold font-mono">
                <span className="text-primary">Apply</span>
                <span className="text-foreground">OS</span>
              </span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
          <p className="text-muted-foreground">Sign in to your account to continue</p>
        </div>

        <Card className="glass-effect">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <Chrome className="mr-2 h-4 w-4" />
                Google
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link href="/auth/signup" className="text-primary hover:underline">
                  Sign up
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Unverified Email Modal */}
      {showResendModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm"
          >
            <Card className="glass-effect">
              <CardHeader>
                <CardTitle className="text-primary">Verify Your Email</CardTitle>
                <CardDescription>
                  Please verify your email address to continue
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  We sent a verification link to <strong>{unverifiedEmail}</strong>. Please check your email and click the link to verify your account.
                </p>
                <div className="p-3 bg-muted rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground">
                    Didn&apos;t receive the email? Check your spam folder or click below to resend it.
                  </p>
                </div>

                {resendSuccess && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm">
                    ✓ Verification email resent successfully!
                  </div>
                )}

                <div className="space-y-2">
                  <Button
                    onClick={handleResendVerification}
                    className="w-full"
                    disabled={resending || resendSuccess}
                  >
                    {resending ? "Sending..." : resendSuccess ? "Email Sent" : "Resend Verification Email"}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setShowResendModal(false)
                      setUnverifiedEmail("")
                      setResendSuccess(false)
                    }}
                  >
                    Back to Login
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginContent />
    </Suspense>
  )
}
