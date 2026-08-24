"use client"

import { useMemo } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { Bell, ChevronRight } from "lucide-react"
import type { Application } from "@/types/database"
import { getFollowUps, DEFAULT_FOLLOW_UP_DAYS } from "@/modules/applications/lib/follow-up"

interface FollowUpCardProps {
  applications: Application[]
  thresholdDays?: number
}

export function FollowUpCard({ applications, thresholdDays = DEFAULT_FOLLOW_UP_DAYS }: FollowUpCardProps) {
  const followUps = useMemo(
    () => getFollowUps(applications, new Date(), thresholdDays),
    [applications, thresholdDays]
  )

  // Nothing to nudge about — stay out of the way.
  if (followUps.length === 0) return null

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Time to follow up
        </CardTitle>
        <CardDescription>
          These applications have been waiting {thresholdDays}+ days without an update.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {followUps.map(({ application, daysSinceUpdate }) => (
          <Link key={application.id} href={`/applications/${application.id}`}>
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:border-primary/40 transition-all">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{application.title}</p>
                {application.company && (
                  <p className="text-xs text-muted-foreground truncate">{application.company}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-xs">
                  {daysSinceUpdate}d waiting
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
