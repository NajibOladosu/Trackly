"use client"

import Image from "next/image"
import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { createClient } from "@/shared/db/supabase/client"
import { Chrome, Shield, AlertTriangle } from "lucide-react"
import { validatePassword, getPasswordStrength } from "@/lib/password-security"

function SignupContent() {
  const searchParams = useSearchParams()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const passwordStrength = password.length > 0 ? getPasswordStrength(password) : null
  const [checkingPassword, setCheckingPassword] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'already_registered') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing error from URL param on mount
      setError('You already have an account. Please sign in instead.')
    }
  }, [searchParams])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setCheckingPassword(true)
    setError("")

    try {
      // Validate password strength and check for breaches
      const passwordValidation = await validatePassword(password)

      if (!passwordValidation.valid) {
        setError(passwordValidation.message || 'Invalid password')
        setLoading(false)
        setCheckingPassword(false)
        return
      }

      setCheckingPassword(false)

      // Call custom signup API that sends welcome email
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          name,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Signup failed')
        setLoading(false)
      } else {
        setSuccess(true)
        setLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
      setCheckingPassword(false)
    }
  }

  const handleGoogleSignup = async () => {
    setLoading(true)

    // Store intent in cookie so callback can access it
    document.cookie = 'auth_intent=signup; path=/; max-age=3600; SameSite=Lax'

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

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <Card className="glass-effect text-center">
            <CardHeader>
              <CardTitle className="text-primary">Verify Your Email</CardTitle>
              <CardDescription>
                Account created successfully! Please check your email to verify your address.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We&apos;ve sent you a verification link. Click the link in your email to complete your signup and access ApplyOS.
              </p>
              <div className="p-3 bg-muted rounded-lg border border-border">
                <p className="text-xs text-muted-foreground">
                  The link will expire in 24 hours. If you don&apos;t see the email, check your spam folder.
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href="/auth/login">Back to Login</Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
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
          <h1 className="text-2xl font-bold text-foreground">Create an account</h1>
          <p className="text-muted-foreground">Get started with ApplyOS today</p>
        </div>

        <Card className="glass-effect">
          <CardHeader>
            <CardTitle>Sign Up</CardTitle>
            <CardDescription>
              Create your account to start tracking applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Full Name
                </label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

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
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />

                {/* Password strength indicator */}
                {passwordStrength && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Password strength:</span>
                      <span className={`font-medium ${passwordStrength.score >= 3 ? 'text-green-500' :
                        passwordStrength.score >= 2 ? 'text-yellow-500' :
                          'text-red-500'
                        }`}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${passwordStrength.score >= 4 ? 'bg-green-500 w-full' :
                          passwordStrength.score >= 3 ? 'bg-green-500 w-3/4' :
                            passwordStrength.score >= 2 ? 'bg-yellow-500 w-1/2' :
                              passwordStrength.score >= 1 ? 'bg-red-500 w-1/4' :
                                'bg-red-500 w-1/4'
                          }`}
                      />
                    </div>
                  </div>
                )}

                {/* Password requirements */}
                <div className="p-3 bg-muted/50 rounded-lg border border-border text-xs space-y-1">
                  <div className="flex items-start gap-2">
                    <Shield className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="space-y-0.5">
                      <p className="font-medium text-muted-foreground">Password must contain:</p>
                      <ul className="text-muted-foreground space-y-0.5">
                        <li>• At least 8 characters</li>
                        <li>• Uppercase and lowercase letters</li>
                        <li>• Numbers and special characters</li>
                      </ul>
                      {checkingPassword && (
                        <p className="text-primary flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" />
                          Checking password security...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90" disabled={loading || checkingPassword}>
                {checkingPassword ? "Checking password..." : loading ? "Creating account..." : "Create Account"}
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
                onClick={handleGoogleSignup}
                disabled={loading}
              >
                <Chrome className="mr-2 h-4 w-4" />
                Google
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/auth/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignupContent />
    </Suspense>
  )
}
