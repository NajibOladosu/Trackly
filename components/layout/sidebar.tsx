"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/shared/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  Upload,
  Bell,
  User,
  Settings,
  LogOut,
  X,
  MessageSquare,
  Mic,
  Briefcase,
} from "lucide-react"
import { motion } from "framer-motion"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/apply", label: "Apply Kit", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/interview", label: "Interview", icon: Mic },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuth()

  const handleLogout = async () => {
    await signOut()
    router.push('/auth/login')
  }

  const handleNavClick = () => {
    onClose?.()
  }

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      {/* Sidebar */}
      <motion.aside
        initial={{ x: -256 }}
        animate={{ x: isOpen ? 0 : -256 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card backdrop-blur-xl md:static md:transform-none md:translate-x-0 md:z-auto"
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 flex-shrink-0 items-center border-b border-border px-6 justify-between">
            <Link href="/dashboard" className="flex items-center space-x-2" onClick={handleNavClick}>
              <Image src="/ApplyOS%20Logo.webp" alt="ApplyOS" width={1073} height={1000} className="h-8 w-auto" />
              <span className="text-xl font-bold font-mono">
                <span className="text-primary">Apply</span>
                <span className="text-foreground">OS</span>
              </span>
            </Link>
            {/* Close button for mobile */}
            <button
              onClick={onClose}
              className="md:hidden p-2 hover:bg-accent rounded-lg transition-colors"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4 overflow-y-auto min-h-0">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative"
                  onClick={handleNavClick}
                >
                  <motion.div
                    whileHover={{ x: 4 }}
                    className={cn(
                      "flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="active-pill"
                        className="h-2 w-2 rounded-full bg-primary flex-shrink-0"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </motion.div>
                </Link>
              )
            })}
          </nav>

          {/* Logout - sticky at bottom */}
          <div className="flex-shrink-0 border-t border-border p-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-destructive hover:text-white"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </motion.aside>
    </>
  )
}
