"use client"

import Image from "next/image"
import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { ArrowLeft } from "lucide-react"

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState(false)

    const handleResetRequest = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")
        setSuccess(false)

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })

            const data = await response.json()

            if (response.ok) {
                setSuccess(true)
            } else {
                setError(data.error || 'Failed to send reset link')
            }
        } catch {
            setError('An error occurred. Please try again.')
        } finally {
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
                    <h1 className="text-2xl font-bold text-foreground">Forgot password?</h1>
                    <p className="text-muted-foreground">Enter your email to reset your password</p>
                </div>

                <Card className="glass-effect">
                    <CardHeader>
                        <div className="flex items-center space-x-2 mb-2">
                            <Link href="/auth/login" className="text-muted-foreground hover:text-primary transition-colors">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                            <CardTitle>Reset Password</CardTitle>
                        </div>
                        <CardDescription>
                            We&apos;ll send you a link to reset your password.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {success ? (
                            <div className="space-y-4">
                                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm">
                                    <p className="font-medium mb-1">Check your email</p>
                                    <p>We&apos;ve sent a password reset link to <strong>{email}</strong>.</p>
                                </div>
                                <Button asChild className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90">
                                    <Link href="/auth/login">Back to Sign In</Link>
                                </Button>
                            </div>
                        ) : (
                            <form onSubmit={handleResetRequest} className="space-y-4">
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

                                <Button type="submit" className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90" disabled={loading}>
                                    {loading ? "Sending link..." : "Send Reset Link"}
                                </Button>

                                <p className="text-center text-sm text-muted-foreground">
                                    Remember your password?{" "}
                                    <Link href="/auth/login" className="text-primary hover:underline">
                                        Sign in
                                    </Link>
                                </p>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    )
}
