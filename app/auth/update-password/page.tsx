"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { createClient } from "@/shared/db/supabase/client"
import { Shield, AlertTriangle } from "lucide-react"
import { validatePassword, getPasswordStrength } from "@/lib/password-security"

export default function UpdatePasswordPage() {
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState(false)
    const passwordStrength = password.length > 0 ? getPasswordStrength(password) : null
    const [checkingPassword, setCheckingPassword] = useState(false)

    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        let authListener: { subscription: { unsubscribe: () => void } } | null = null;
        let timeoutTimer: NodeJS.Timeout;

        const setupAuth = async () => {
            // 1. Check if we already have a session
            const { data: { session } } = await supabase.auth.getSession()

            if (session) {
                console.log("✅ Session found on mount")
                setLoading(false)
                return
            }

            // 2. Manual Hash Parsing Fallback (Robustness for Implicit Flow)
            // Sometimes `supabase-js` doesn't auto-detect the hash if the client was already initialized.
            const hash = window.location.hash
            if (hash && hash.includes('access_token') && hash.includes('type=recovery')) {
                console.log("🔄 Manual hash detection triggered")
                try {
                    // Extract tokens manually
                    const params = new URLSearchParams(hash.substring(1)) // remove #
                    const accessToken = params.get('access_token')
                    const refreshToken = params.get('refresh_token')

                    if (accessToken && refreshToken) {
                        const { data, error } = await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken,
                        })

                        if (!error && data.session) {
                            console.log("✅ Session manually established from hash")
                            setLoading(false)
                            return
                        }
                    }
                } catch (e) {
                    console.error("Manual hash parsing failed", e)
                }
            }

            // 3. If no session yet, listen for the implicit flow to complete
            // processing the #access_token from the URL
            const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
                console.log("🔐 Auth state change:", event)

                if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
                    if (session) {
                        console.log("✅ Session established via event")
                        setLoading(false)
                        setError("")
                        clearTimeout(timeoutTimer)
                    }
                }
            })
            authListener = data

            // 4. Set a timeout - if supabase-js hasn't found a session by now,
            // the link is probably invalid or expired.
            timeoutTimer = setTimeout(() => {
                // Double check one last time
                supabase.auth.getSession().then(({ data: { session } }) => {
                    if (!session) {
                        setLoading(false)
                        setError("Valid verification link required. If your link has expired, please request a new one.")
                    }
                })
            }, 5000) // Give it 5 seconds to parse the hash
        }

        setupAuth()

        return () => {
            if (authListener) authListener.subscription.unsubscribe()
            clearTimeout(timeoutTimer)
        }
    }, [supabase.auth])

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault()

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            return
        }

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

            const { error } = await supabase.auth.updateUser({
                password: password,
            })

            if (error) {
                setError(error.message)
            } else {
                setSuccess(true)
                // Redirect to login after a delay
                setTimeout(() => {
                    router.push("/auth/login")
                }, 2000)
            }
            setLoading(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
            setLoading(false)
            setCheckingPassword(false)
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
                    <h1 className="text-2xl font-bold text-foreground">Update password</h1>
                    <p className="text-muted-foreground">Set a new password for your account</p>
                </div>

                <Card className="glass-effect">
                    <CardHeader>
                        <CardTitle>New Password</CardTitle>
                        <CardDescription>
                            Please enter your new password below.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading && !success && !checkingPassword ? (
                            <div className="flex flex-col items-center justify-center py-8 space-y-4">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                <p className="text-sm text-muted-foreground">Verifying your link...</p>
                            </div>
                        ) : success ? (
                            <div className="space-y-4">
                                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm">
                                    <p className="font-medium mb-1">Success!</p>
                                    <p>Your password has been updated. Redirecting you to the dashboard...</p>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleUpdatePassword} className="space-y-4">
                                {error && (
                                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                                        {error}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label htmlFor="password" className="text-sm font-medium">
                                        New Password
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

                                <div className="space-y-2">
                                    <label htmlFor="confirmPassword" className="text-sm font-medium">
                                        Confirm New Password
                                    </label>
                                    <Input
                                        id="confirmPassword"
                                        type="password"
                                        placeholder="••••••••"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                    />
                                </div>

                                <Button type="submit" className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90" disabled={loading || checkingPassword}>
                                    {checkingPassword ? "Checking password..." : loading ? "Updating password..." : "Update Password"}
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    )
}
