"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/shared/ui/button"
import { ArrowLeft, FileText } from "lucide-react"

export default function TermsOfService() {
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
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-5xl font-bold mb-4">Terms of Service</h1>
              <p className="text-muted-foreground">
                Last updated: November 9, 2024
              </p>
            </div>

            {/* Content Sections */}
            <div className="prose dark:prose-invert max-w-none">
              <div className="space-y-8">
                {/* Introduction */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Agreement to Terms</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    By accessing or using ApplyOS, you agree to be bound by these Terms of Service and all applicable laws
                    and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing
                    this application.
                  </p>
                </section>

                {/* Account Registration */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Account Registration</h2>
                  <div className="space-y-4 text-muted-foreground">
                    <p className="leading-relaxed">
                      To use ApplyOS, you must create an account by providing accurate and complete information. You are
                      responsible for:
                    </p>
                    <ul className="space-y-2 list-disc list-inside ml-4">
                      <li>Maintaining the security of your account credentials</li>
                      <li>All activities that occur under your account</li>
                      <li>Notifying us immediately of any unauthorized access</li>
                      <li>Ensuring your information remains accurate and up-to-date</li>
                    </ul>
                    <p className="leading-relaxed mt-4">
                      You must be at least 13 years old to create an account. If you are under 18, you must have parental
                      consent to use ApplyOS.
                    </p>
                  </div>
                </section>

                {/* Acceptable Use */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Acceptable Use</h2>
                  <div className="space-y-4 text-muted-foreground">
                    <p className="leading-relaxed">You agree not to:</p>
                    <ul className="space-y-2 list-disc list-inside ml-4">
                      <li>Use ApplyOS for any illegal or unauthorized purpose</li>
                      <li>Upload malicious code, viruses, or harmful content</li>
                      <li>Attempt to gain unauthorized access to our systems</li>
                      <li>Interfere with or disrupt the service or servers</li>
                      <li>Use automated systems to access the service without permission</li>
                      <li>Impersonate another person or entity</li>
                      <li>Harass, abuse, or harm other users</li>
                      <li>Violate any applicable laws or regulations</li>
                      <li>Scrape or copy content without authorization</li>
                      <li>Reverse engineer or attempt to extract source code</li>
                    </ul>
                  </div>
                </section>

                {/* User Content */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">User Content</h2>
                  <div className="space-y-4 text-muted-foreground">
                    <p className="leading-relaxed">
                      You retain all rights to the content you upload to ApplyOS, including documents, applications, and
                      other materials. By uploading content, you grant us a license to:
                    </p>
                    <ul className="space-y-2 list-disc list-inside ml-4">
                      <li>Store and process your content to provide our services</li>
                      <li>Use your content for AI analysis and answer generation</li>
                      <li>Display your content back to you within the application</li>
                    </ul>
                    <p className="leading-relaxed mt-4">
                      You are responsible for ensuring you have the right to upload and share any content you submit to
                      ApplyOS. You agree not to upload content that infringes on intellectual property rights, contains
                      confidential information you&apos;re not authorized to share, or violates any laws.
                    </p>
                  </div>
                </section>

                {/* AI Services */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">AI-Powered Features</h2>
                  <div className="space-y-4 text-muted-foreground">
                    <p className="leading-relaxed">
                      ApplyOS uses artificial intelligence to analyze documents and generate answers. You acknowledge that:
                    </p>
                    <ul className="space-y-2 list-disc list-inside ml-4">
                      <li>AI-generated content may contain errors or inaccuracies</li>
                      <li>You should review and verify all AI-generated content before use</li>
                      <li>We are not responsible for the accuracy of AI-generated answers</li>
                      <li>Your content may be processed by third-party AI services (Google Gemini)</li>
                      <li>AI features require your consent and can be disabled at any time</li>
                    </ul>
                    <p className="leading-relaxed mt-4">
                      You are solely responsible for the content of your applications and should always review AI-generated
                      answers before submitting them.
                    </p>
                  </div>
                </section>

                {/* Intellectual Property */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Intellectual Property</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    ApplyOS and its original content, features, and functionality are owned by ApplyOS and are protected
                    by international copyright, trademark, patent, trade secret, and other intellectual property laws.
                    You may not copy, modify, distribute, sell, or lease any part of our services without explicit permission.
                  </p>
                </section>

                {/* Service Availability */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Service Availability</h2>
                  <div className="space-y-4 text-muted-foreground">
                    <p className="leading-relaxed">
                      We strive to provide reliable service, but we do not guarantee that:
                    </p>
                    <ul className="space-y-2 list-disc list-inside ml-4">
                      <li>ApplyOS will be available 24/7 without interruption</li>
                      <li>The service will be error-free or bug-free</li>
                      <li>Defects will be corrected immediately</li>
                      <li>The service will meet your specific requirements</li>
                    </ul>
                    <p className="leading-relaxed mt-4">
                      We reserve the right to modify, suspend, or discontinue any part of the service at any time with or
                      without notice.
                    </p>
                  </div>
                </section>

                {/* Data Backup */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Data Backup and Loss</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    While we implement backup procedures, you are responsible for maintaining your own backup copies of
                    important content. We are not liable for any data loss, corruption, or deletion that may occur.
                    We strongly recommend keeping copies of important documents outside of ApplyOS.
                  </p>
                </section>

                {/* Termination */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Termination</h2>
                  <div className="space-y-4 text-muted-foreground">
                    <p className="leading-relaxed">
                      We may terminate or suspend your account immediately, without prior notice, if you:
                    </p>
                    <ul className="space-y-2 list-disc list-inside ml-4">
                      <li>Violate these Terms of Service</li>
                      <li>Engage in fraudulent or illegal activities</li>
                      <li>Abuse or misuse the service</li>
                      <li>Harm other users or our reputation</li>
                    </ul>
                    <p className="leading-relaxed mt-4">
                      You may terminate your account at any time through the account settings page. Upon termination,
                      your right to use the service will immediately cease, and your data will be deleted according to
                      our data retention policy.
                    </p>
                  </div>
                </section>

                {/* Disclaimers */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Disclaimers</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    APPLYOS IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
                    INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
                    NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
                  </p>
                </section>

                {/* Limitation of Liability */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Limitation of Liability</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    TO THE MAXIMUM EXTENT PERMITTED BY LAW, APPLYOS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                    CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR USE, ARISING OUT OF OR
                    RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE
                    PAST 12 MONTHS, OR $100, WHICHEVER IS GREATER.
                  </p>
                </section>

                {/* Indemnification */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Indemnification</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    You agree to indemnify and hold harmless ApplyOS, its affiliates, and their respective officers, directors,
                    employees, and agents from any claims, damages, losses, liabilities, and expenses (including legal fees)
                    arising from your use of the service, violation of these terms, or infringement of any rights of another
                    party.
                  </p>
                </section>

                {/* Governing Law */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Governing Law</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    These Terms shall be governed by and construed in accordance with the laws of the United States,
                    without regard to its conflict of law provisions. Any disputes arising from these terms or your use
                    of ApplyOS shall be subject to the exclusive jurisdiction of the courts in that location.
                  </p>
                </section>

                {/* Changes to Terms */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Changes to Terms</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We reserve the right to modify these Terms at any time. We will notify users of any material changes
                    by posting the new Terms on this page and updating the &quot;Last updated&quot; date. Your continued use of
                    ApplyOS after any changes constitutes acceptance of the new Terms.
                  </p>
                </section>

                {/* Severability */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Severability</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    If any provision of these Terms is found to be unenforceable or invalid, that provision will be limited
                    or eliminated to the minimum extent necessary, and the remaining provisions will remain in full force
                    and effect.
                  </p>
                </section>

                {/* Contact */}
                <section className="glass-effect rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-primary mb-4">Contact Us</h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    If you have any questions about these Terms of Service, please contact us at:
                  </p>
                  <div className="text-foreground">
                    <p className="font-semibold">ApplyOS Support</p>
                    <p className="text-muted-foreground">Email: legal@applyos.io</p>
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
