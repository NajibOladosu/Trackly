"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import {
  FileText,
  Brain,
  TrendingUp,
  ArrowRight,
  Zap,
  Shield,
  Clock,
  Chrome
} from "lucide-react"
import { BlogSettingsButton } from "@/components/blog-settings-button"

const features = [
  {
    icon: Brain,
    title: "AI-Powered Intelligence",
    description: "Automatically extract questions from job postings and generate personalized answers using advanced AI.",
  },
  {
    icon: FileText,
    title: "Document Analysis",
    description: "Upload your resume, transcripts, and certificates. Our AI extracts and organizes your data intelligently.",
  },
  {
    icon: TrendingUp,
    title: "Smart Tracking",
    description: "Track all your applications in one place with status updates, deadlines, and priority management.",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Apply to opportunities 10x faster with AI-generated responses tailored to your experience.",
  },
  {
    icon: Shield,
    title: "Secure & Private",
    description: "Your data is encrypted and secured with enterprise-grade protection.",
  },
  {
    icon: Clock,
    title: "Never Miss a Deadline",
    description: "Get smart notifications and reminders for upcoming deadlines and important updates.",
  },
]

const steps = [
  {
    number: "01",
    title: "Upload Your Documents",
    description: "Add your resume, transcripts, and other relevant documents to your profile.",
  },
  {
    number: "02",
    title: "Add Applications",
    description: "Paste the URL of a job posting or scholarship. Our AI extracts all the questions.",
  },
  {
    number: "03",
    title: "AI Generates Answers",
    description: "Get personalized, professional answers based on your documents and experience.",
  },
  {
    number: "04",
    title: "Track & Apply",
    description: "Manage your applications, track progress, and never miss a deadline.",
  },
]

export default function Home() {
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

          <div className="flex items-center space-x-4">
            <Button variant="outline" asChild className="text-foreground border-foreground/20 hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all">
              <Link href="/auth/login">Sign In</Link>
            </Button>
            <Button asChild className="bg-primary text-primary-foreground font-bold hover:bg-primary/90">
              <Link href="/auth/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden min-h-[max(85vh,700px)] flex items-center justify-center px-6 text-center">
        {/* Background Glow Effect behind the text */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[300px] bg-primary/20 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="container mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* H1: High Contrast White + Neon */}
            <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight text-foreground flex flex-col gap-4">
              <span>The Operating System for</span>
              <span className="text-primary drop-shadow-[0_0_15px_rgba(0,255,136,0.25)]">
                Your Job Search
              </span>
            </h1>

            {/* Subheadline: Light Gray for readability on Dark */}
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-8">
              Stop juggling spreadsheets. <span className="text-foreground font-semibold">ApplyOS</span> parses job URLs,
              auto-generates targeted AI responses, and executes your application pipeline from one command center.
            </p>

            {/* CTAs: Neon Button + Ghost Button */}
            <div className="flex items-center justify-center space-x-6">
              <Button
                asChild
                className="bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] transition-all duration-200"
              >
                <Link href="/auth/signup">Get Started</Link>
              </Button>

              <Button
                variant="outline"
                asChild
                className="text-foreground border-foreground/20 hover:border-primary hover:bg-primary hover:text-primary-foreground group transition-all"
              >
                <a
                  href="https://chromewebstore.google.com/detail/gikepikgajfppgebbgcikhocdeejandg?utm_source=item-share-cb"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2"
                >
                  <Chrome className="h-4 w-4" aria-hidden="true" />
                  <span>Chrome Extension</span>
                </a>
              </Button>
            </div>

            {/* Social Proof: Darker muted text */}
            <div className="mt-16 pt-8 border-t border-border">
              <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase font-mono">
                Optimized for high-performance candidates
              </p>
            </div>
          </motion.div>
        </div>
      </section>


      {/* Features Section */}
      < section id="features" className="py-20 px-6 bg-secondary/30" >
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Powerful Features</h2>
            <p className="text-xl text-muted-foreground">
              Everything you need to streamline your application process
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <Card className="h-full hover:border-primary/40 transition-all hover:glow-effect">
                    <CardHeader>
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle>{feature.title}</CardTitle>
                      <CardDescription>{feature.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section >

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-6">
        <div id="tracking" className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-xl text-muted-foreground">
              Get started in 4 simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="relative"
              >
                <div className="text-6xl font-bold text-primary/10 mb-4">{step.number}</div>
                <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section >

      {/* Chrome Extension Section */}
      <section id="browser-extension" className="py-20 px-6">
        <div className="container mx-auto">
          <Card className="glass-effect border-primary/20 bg-background/50">
            <CardContent className="p-12 flex items-center gap-12 flex-col md:flex-row">
              <div className="flex-1 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  <Chrome className="h-4 w-4" />
                  Browser Extension
                </div>
                <h2 className="text-4xl font-bold">
                  Save Jobs Faster with the ApplyOS Extension
                </h2>
                <p className="text-xl text-muted-foreground">
                  Stop copy-pasting URLs. With our Chrome extension, you can extract
                  job details and application questions directly from any tab in seconds.
                </p>
                <div className="pt-4">
                  <Button
                    asChild
                    className="bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] transition-all duration-200"
                  >
                    <a
                      href="https://chromewebstore.google.com/detail/gikepikgajfppgebbgcikhocdeejandg?utm_source=item-share-cb"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2"
                    >
                      <Chrome className="h-5 w-5" aria-hidden="true" />
                      <span>Download for Chrome</span>
                    </a>
                  </Button>
                </div>
              </div>
              <div className="flex-1 w-full flex justify-center">
                {/* Visualizer Placeholder */}
                <div className="relative w-full max-w-sm aspect-square rounded-2xl bg-secondary/50 border border-border flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-50"></div>
                  <div className="h-24 w-24 rounded-2xl bg-card border border-border shadow-2xl flex items-center justify-center relative z-10">
                    <Chrome className="h-12 w-12 text-primary" />
                  </div>

                  {/* Abstract floating elements */}
                  <motion.div
                    className="absolute top-10 right-10 h-16 w-32 bg-card border border-border rounded-lg shadow-lg"
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <motion.div
                    className="absolute bottom-16 left-8 h-12 w-40 bg-card border border-border rounded-lg shadow-lg"
                    animate={{ y: [0, 10, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      < section className="py-20 px-6 bg-secondary/30" >
        <div className="container mx-auto">
          <Card className="glass-effect border-primary/20">
            <CardContent className="p-12 text-center">
              <h2 className="text-4xl font-bold mb-4">
                Ready to Transform Your Application Process?
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Join thousands of users who are applying smarter, not harder.
              </p>
              <Button
                asChild
                className="bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] transition-all duration-200"
              >
                <Link href="/auth/signup" className="flex items-center gap-2">
                  <span>Get Started</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section >

      {/* Footer */}
      <footer className="bg-card border-t border-border py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* Brand Section */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Image src="/ApplyOS%20Logo.webp" alt="ApplyOS" width={1073} height={1000} className="h-8 w-auto" />
              <span className="text-xl font-bold font-mono text-foreground">
                <span className="text-primary">Apply</span>OS
              </span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm font-sans">
              ApplyOS is the definitive <strong>AI-powered application manager</strong> designed to streamline your career
              growth. By leveraging advanced <strong>AI application autofill</strong> technology, we help
              candidates <strong>automate job applications</strong>, extract complex scholarship questions, and
              maintain a high-performance <strong>job search pipeline</strong>.
            </p>
          </div>

          {/* Quick Links / SEO Keywords */}
          <div className="grid grid-cols-2 gap-4 text-sm font-sans">
            <div>
              <h3 className="text-foreground font-semibold mb-3">System</h3>
              <ul className="text-muted-foreground space-y-2">
                <li><Link href="#features" className="hover:text-primary transition-colors">AI Answer Engine</Link></li>
                <li><Link href="#tracking" className="hover:text-primary transition-colors">Pipeline Tracker</Link></li>
                <li><Link href="/auth/signup" className="hover:text-primary transition-colors">Initialize Account</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-foreground font-semibold mb-3">Resources</h3>
              <ul className="text-muted-foreground space-y-2">
                <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Protocol</Link></li>
                <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
                <li><a href="https://blog.applyos.io" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Blog</a></li>
                <li className="text-muted-foreground/50">v1.0.4-stable</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8 text-center">
          <p className="text-muted-foreground text-xs">
            &copy; {new Date().getFullYear()} ApplyOS. High-Performance Job Search Automation.
          </p>
        </div>
      </footer>

      {/* Floating Settings Button */}
      <BlogSettingsButton />
    </div >
  )
}
