"use client"

import { useMemo, useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { Card, CardContent } from "@/shared/ui/card"
import { Input } from "@/shared/ui/input"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Search, BookOpen } from "lucide-react"
import { GLOSSARY, type GlossaryTerm } from "@/modules/resources/lib/glossary"

const CATEGORIES = ["All", "Process", "Documents", "Interview", "Compensation", "Systems"] as const
type Category = (typeof CATEGORIES)[number]

export default function ResourcesPage() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<Category>("All")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GLOSSARY.filter((t: GlossaryTerm) => {
      const matchesCategory = category === "All" || t.category === category
      const matchesQuery =
        !q ||
        t.term.toLowerCase().includes(q) ||
        t.abbreviation?.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    }).sort((a, b) => a.term.localeCompare(b.term))
  }, [query, category])

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-primary" />
            Job Search Glossary
          </h1>
          <p className="text-muted-foreground mt-2">
            Plain-English explanations of common hiring and job-search terms.
          </p>
        </div>

        {/* Search + filters */}
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search terms..."
                className="pl-10"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map((cat) => (
                <Button
                  key={cat}
                  variant={category === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Terms */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              No terms match your search.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((t) => (
              <Card key={t.term}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <h3 className="font-semibold">
                      {t.term}
                      {t.abbreviation && (
                        <span className="text-muted-foreground font-normal"> ({t.abbreviation})</span>
                      )}
                    </h3>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {t.category}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{t.definition}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
