"use client"

import Image from "next/image"
import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { Check } from "lucide-react"

export default function VerifiedPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to login after 3 seconds
    const timer = setTimeout(() => {
      router.push("/auth/login")
    }, 3000)

    return () => clearTimeout(timer)
  }, [router])

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
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="flex justify-center mb-4"
            >
              <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
            </motion.div>
            <CardTitle className="text-2xl">Email Verified!</CardTitle>
            <CardDescription className="text-base mt-2">
              Your email has been successfully verified
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                You can now sign in to your account and start using ApplyOS.
              </p>
            </div>

            <div className="space-y-3">
              <Button asChild className="w-full">
                <Link href="/auth/login">
                  Sign In to Your Account
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Redirecting to login in 3 seconds...
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
