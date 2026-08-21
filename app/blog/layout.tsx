import Image from "next/image"
import Link from "next/link"
import { Metadata } from "next"
import { BlogSettingsButton } from "@/components/blog-settings-button"

export const metadata: Metadata = {
    title: {
        default: "ApplyOS Blog",
        template: "%s | ApplyOS Blog",
    },
    description: "Insights, tutorials, and updates from the ApplyOS team on AI-powered job applications, career tech, and the future of job searching.",
    openGraph: {
        type: "website",
        siteName: "ApplyOS Blog",
        url: "https://blog.applyos.io",
    },
    alternates: {
        canonical: "https://blog.applyos.io",
    },
}

export default function BlogLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-background">
            {/* Blog Navigation */}
            <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/80 backdrop-blur-xl">
                <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="https://blog.applyos.io" className="flex items-center space-x-2">
                        <Image src="/ApplyOS%20Logo.webp" alt="ApplyOS" width={1073} height={1000} className="h-8 w-auto" />
                        <span className="text-xl font-bold font-mono">
                            <span className="text-primary">Apply</span>
                            <span className="text-foreground">OS</span>
                            <span className="text-muted-foreground ml-2 text-sm font-normal">Blog</span>
                        </span>
                    </Link>

                    <div className="flex items-center space-x-4">
                        <Link
                            href="https://applyos.io"
                            className="text-muted-foreground hover:text-primary transition-colors text-sm"
                        >
                            ← Back to ApplyOS
                        </Link>
                        <Link
                            href="https://applyos.io/auth/signup"
                            className="bg-primary text-primary-foreground font-bold px-4 py-2 rounded-md text-sm hover:bg-primary/90 transition-colors"
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="pt-24 pb-16">
                {children}
            </main>

            {/* Floating Settings Button */}
            <BlogSettingsButton />

            {/* Blog Footer */}
            <footer className="bg-card border-t border-border py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="flex items-center justify-center space-x-2 mb-4">
                        <Image src="/ApplyOS%20Logo.webp" alt="ApplyOS" width={1073} height={1000} className="h-6 w-auto" />
                        <span className="text-lg font-bold font-mono text-foreground">
                            <span className="text-primary">Apply</span>OS
                        </span>
                    </div>
                    <p className="text-muted-foreground text-sm mb-6">
                        The Operating System for Your Job Search
                    </p>
                    <div className="flex items-center justify-center space-x-6 text-sm text-muted-foreground">
                        <Link href="https://applyos.io" className="hover:text-primary transition-colors">
                            Main Site
                        </Link>
                        <Link href="https://applyos.io/privacy" className="hover:text-primary transition-colors">
                            Privacy
                        </Link>
                        <Link href="https://applyos.io/terms" className="hover:text-primary transition-colors">
                            Terms
                        </Link>
                    </div>
                    <p className="text-muted-foreground text-xs mt-8">
                        © {new Date().getFullYear()} ApplyOS. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    )
}
