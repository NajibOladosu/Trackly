"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Bell, Search, Menu, FileText, Briefcase, X, Loader2 } from "lucide-react"
import { Input } from "@/shared/ui/input"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { useAuth } from "@/contexts/AuthContext"
import { getNotifications } from "@/lib/services/notifications"
import { getApplications } from "@/modules/applications/services/application.service"
import { getDocuments } from "@/modules/documents/services/document.service"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/shared/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

interface TopBarProps {
  onMenuClick?: () => void
}

type SearchResult = {
  id: string
  title: string
  subtitle?: string
  type: "application" | "document"
  href: string
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState<number>(0)

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const notifications = await getNotifications()
        const unread = notifications.filter((n) => !n.is_read).length
        setUnreadCount(unread)
      } catch (error) {
        // Fail silently; do not break top bar if notifications fail
        console.error("Error loading notifications:", error)
      }
    }

    if (user) {
      void loadNotifications()
    } else {
      setUnreadCount(0)
    }
  }, [user])

  // Handle search logic
  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setSearchResults([])
        setShowResults(false)
        return
      }

      setIsSearching(true)
      try {
        const [apps, docs] = await Promise.all([
          getApplications(),
          getDocuments()
        ])

        const filteredApps: SearchResult[] = apps
          .filter(app =>
            app.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            app.company?.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map(app => ({
            id: app.id,
            title: app.title,
            subtitle: app.company ?? undefined,
            type: "application",
            href: `/applications/${app.id}`
          }))

        const filteredDocs: SearchResult[] = docs
          .filter(doc =>
            doc.file_name.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map(doc => ({
            id: doc.id,
            title: doc.file_name,
            type: "document",
            href: `/documents/${doc.id}`
          }))

        const combined = [...filteredApps, ...filteredDocs].slice(0, 8)
        setSearchResults(combined)
        setShowResults(combined.length > 0)
        setSelectedIndex(-1)
      } catch (error) {
        console.error("Search error:", error)
      } finally {
        setIsSearching(false)
      }
    }

    const timer = setTimeout(performSearch, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Click outside to close search results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault()
      const selected = searchResults[selectedIndex]
      router.push(selected.href)
      setShowResults(false)
      setSearchQuery("")
    } else if (e.key === "Escape") {
      setShowResults(false)
    }
  }

  const name =
    (user?.user_metadata && (user.user_metadata.name || user.user_metadata.full_name)) ||
    user?.email?.split("@")[0] ||
    "User"

  const email = user?.email || ""

  const initials = name
    .split(" ")
    .filter((part: string) => Boolean(part))
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("") || "U"

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 backdrop-blur-xl px-4 sm:px-6 md:px-8 gap-4">
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden flex-shrink-0"
        onClick={onMenuClick}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search Bar - Hidden on mobile, shown on tablet and up */}
      <div className="hidden sm:flex flex-1 max-w-xl relative" ref={searchRef}>
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search applications, documents..."
            className="pl-10 text-sm focus-visible:ring-primary/20 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && searchResults.length > 0 && setShowResults(true)}
            onKeyDown={handleKeyDown}
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {searchQuery && !isSearching && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        <AnimatePresence>
          {showResults && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50 max-h-[400px] overflow-y-auto backdrop-blur-xl"
            >
              <div className="p-2">
                {searchResults.map((result, index) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => {
                      router.push(result.href)
                      setShowResults(false)
                      setSearchQuery("")
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all",
                      selectedIndex === index ? "bg-primary/10 text-primary" : "hover:bg-accent/10"
                    )}
                  >
                    <div className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                      result.type === 'application' ? "bg-primary/20 text-primary" : "bg-primary/20 text-primary"
                    )}>
                      {result.type === 'application' ? (
                        <Briefcase className="h-5 w-5" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{result.title}</p>
                      {result.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                      )}
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 font-bold">
                        {result.type}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notifications Bell */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => router.push("/notifications")}
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] rounded-full p-0 flex items-center justify-center text-[0.6rem]"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>

        {/* User Profile Section - Hidden on small mobile, shown on larger screens */}
        <div className="hidden sm:flex items-center gap-2 md:gap-3 cursor-pointer hover:opacity-75 transition-opacity" onClick={() => router.push('/profile')}>
          <div className="text-right">
            <p className="text-sm font-medium truncate max-w-[100px] md:max-w-[140px]">
              {name}
            </p>
            {email && (
              <p className="text-xs text-muted-foreground truncate max-w-[100px] md:max-w-[160px]">
                {email}
              </p>
            )}
          </div>
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-sm font-bold text-primary-foreground">
              {initials}
            </span>
          </div>
        </div>

        {/* Avatar Only on Small Mobile */}
        <div className="sm:hidden h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center cursor-pointer hover:opacity-75 transition-opacity" onClick={() => router.push('/profile')}>
          <span className="text-sm font-bold text-primary-foreground">
            {initials}
          </span>
        </div>
      </div>
    </header>
  )
}
