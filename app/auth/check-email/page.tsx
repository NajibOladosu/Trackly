"use client"

import Image from "next/image"
import { useState, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { Mail, ArrowLeft } from "lucide-react"

function CheckEmailContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get("email") || ""
  const [resending, setResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState("")

  const handleResendEmail = async () => {
    if (!email) return

    setResending(true)
    setResendError("")

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (response.ok) {
        setResendSuccess(true)
        setTimeout(() => {
          setResendSuccess(false)
        }, 5000)
      } else {
        const data = await response.json()
        setResendError(data.error || "Failed to resend verification email")
      }
    } catch {
      setResendError("An error occurred while resending email")
    } finally {
      setResending(false)
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
        </div>

        <Card className="glass-effect">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">Check Your Email</CardTitle>
            <CardDescription className="text-base mt-2">
              We&apos;ve sent a verification link to your email address
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {email && (
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm text-muted-foreground text-center">
                  Email: <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Click the verification link in the email to confirm your account. The link will expire in 24 hours.
              </p>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>Check your inbox</li>
                <li>If you don&apos;t see it, check your spam folder</li>
                <li>The link will expire in 24 hours</li>
              </ul>
            </div>

            {resendSuccess && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 text-sm">
                ✓ Verification email resent successfully!
              </div>
            )}

            {resendError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {resendError}
              </div>
            )}

            <div className="space-y-3 pt-4">
              <Button
                onClick={handleResendEmail}
                disabled={resending || resendSuccess}
                className="w-full"
                variant="default"
              >
                {resending ? "Sending..." : resendSuccess ? "Email Sent" : "Resend Verification Email"}
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full"
              >
                <Link href="/auth/login" className="flex items-center justify-center">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Login
                </Link>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center pt-4 border-t border-border">
              Didn&apos;t receive an email? Make sure your email address is correct and check your spam folder.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CheckEmailContent />
    </Suspense>
  )
}
