"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/shared/ui/button"
import { ArrowLeft, Shield } from "lucide-react"

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/ApplyOS%20Logo.webp" alt="ApplyOS" width={1073} height={1000} className="h-8 w-auto" />
            <span className="text-xl font-bold font-mono">
              <span className="text-primary">Apply</span>
              <span className="text-foreground">OS</span>
            </span>
          </Link>

          <Button variant="ghost" asChild>
            <Link href="/" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>
      </nav>

      {/* Content */}
      <main className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Header */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-6">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-5xl font-bold mb-4">Privacy Policy</h1>
              <p className="text-muted-foreground">
                Last updated: November 9, 2024
              </p>
            </div>

            {/* Content Sections */}
            <div className="prose dark:prose-invert max-w-none">
              <div className="space-y-8">
                {/* Introduction */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Introduction</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Welcome to ApplyOS. We are committed to protecting your personal information and your right to privacy.
                    This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use
                    our application management platform.
                  </p>
                </section>

                {/* Information We Collect */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Information We Collect</h2>
                  <div className="space-y-4 text-muted-foreground">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">Personal Information</h3>
                      <p className="leading-relaxed">
                        When you create an account, we collect information such as your name, email address, and profile details.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">Document Data</h3>
                      <p className="leading-relaxed">
                        We process and store documents you upload, including resumes, transcripts, cover letters, and certificates.
                        This data is used to provide AI-powered analysis and answer generation features.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">Application Information</h3>
                      <p className="leading-relaxed">
                        We store information about your job and scholarship applications, including URLs, deadlines, status updates,
                        questions, and answers.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">Usage Data</h3>
                      <p className="leading-relaxed">
                        We automatically collect certain information when you use ApplyOS, including your IP address, browser type,
                        device information, and usage patterns.
                      </p>
                    </div>
                  </div>
                </section>

                {/* How We Use Your Information */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">How We Use Your Information</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p className="leading-relaxed">We use your information to:</p>
                    <ul className="space-y-2 list-disc list-inside ml-4">
                      <li>Provide, operate, and maintain our services</li>
                      <li>Process your documents using AI analysis</li>
                      <li>Generate personalized answers to application questions</li>
                      <li>Send you notifications and reminders about deadlines</li>
                      <li>Improve and optimize our platform</li>
                      <li>Respond to your inquiries and provide customer support</li>
                      <li>Detect and prevent fraud and abuse</li>
                      <li>Comply with legal obligations</li>
                    </ul>
                  </div>
                </section>

                {/* AI Processing */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">AI Processing</h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    ApplyOS uses Google Gemini AI to analyze your documents and generate answers. When you use AI features:
                  </p>
                  <ul className="space-y-2 list-disc list-inside ml-4 text-muted-foreground">
                    <li>Your document content is sent to Google&apos;s Gemini API for processing</li>
                    <li>Google processes this data according to their own privacy policy</li>
                    <li>We cache extracted text and AI-generated results in our secure database</li>
                    <li>You can disable AI features and delete your data at any time</li>
                  </ul>
                </section>

                {/* Data Security */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Data Security</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We implement enterprise-grade security measures to protect your data, including encryption in transit and at rest,
                    secure authentication via Supabase, row-level security policies, and regular security audits. However, no method
                    of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
                  </p>
                </section>

                {/* Data Retention */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Data Retention</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We retain your personal information and documents for as long as your account is active or as needed to provide
                    you services. You can delete individual documents or your entire account at any time. When you delete your account,
                    all associated data is permanently removed from our systems.
                  </p>
                </section>

                {/* Your Rights */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Your Rights</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p className="leading-relaxed">You have the right to:</p>
                    <ul className="space-y-2 list-disc list-inside ml-4">
                      <li>Access your personal information</li>
                      <li>Update or correct your information</li>
                      <li>Delete your account and associated data</li>
                      <li>Export your data</li>
                      <li>Opt-out of certain data processing activities</li>
                      <li>Object to automated decision-making</li>
                    </ul>
                  </div>
                </section>

                {/* Third-Party Services */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Third-Party Services</h2>
                  <div className="space-y-4 text-muted-foreground">
                    <p className="leading-relaxed">ApplyOS integrates with the following third-party services:</p>
                    <ul className="space-y-2 list-disc list-inside ml-4">
                      <li><span className="font-semibold text-foreground">Supabase</span> - Database, authentication, and file storage</li>
                      <li><span className="font-semibold text-foreground">Google Gemini AI</span> - Document analysis and answer generation</li>
                      <li><span className="font-semibold text-foreground">Vercel</span> - Hosting and deployment</li>
                    </ul>
                    <p className="leading-relaxed mt-4">
                      Each service has its own privacy policy governing how they handle your data.
                    </p>
                  </div>
                </section>

                {/* Cookies */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Cookies and Tracking</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We use cookies and similar tracking technologies to maintain your session and improve your experience.
                    Essential cookies are required for authentication and cannot be disabled. You can control non-essential
                    cookies through your browser settings.
                  </p>
                </section>

                {/* Children's Privacy */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Children&apos;s Privacy</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    ApplyOS is not intended for users under the age of 13. We do not knowingly collect personal information
                    from children under 13. If you believe we have collected information from a child under 13, please contact
                    us immediately.
                  </p>
                </section>

                {/* Changes to Privacy Policy */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Changes to This Privacy Policy</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new
                    Privacy Policy on this page and updating the &quot;Last updated&quot; date. You are advised to review this Privacy
                    Policy periodically for any changes.
                  </p>
                </section>

                {/* Contact */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Contact Us</h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    If you have any questions about this Privacy Policy or our data practices, please contact us at:
                  </p>
                  <div className="text-foreground">
                    <p className="font-semibold">ApplyOS Support</p>
                    <p className="text-muted-foreground">Email: privacy@applyos.io</p>
                  </div>
                </section>
              </div>
            </div>

            {/* Footer CTA */}
            <div className="mt-12 text-center">
              <Button asChild className="glow-effect">
                <Link href="/">Return to Home</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="container mx-auto text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} ApplyOS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
