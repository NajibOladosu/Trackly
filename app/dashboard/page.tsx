"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { MetricsCard } from "@/modules/analytics/components/MetricsCard"
import { TimelineChart } from "@/modules/analytics/components/TimelineChart"
import { ConversionFunnel } from "@/modules/analytics/components/ConversionFunnel"
import { SankeyChart } from "@/modules/analytics/components/SankeyChart"
import { motion } from "framer-motion"
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  Briefcase,
  Loader2,
  TrendingUp,
  Award,
  Target,
} from "lucide-react"
import { createClient } from "@/shared/db/supabase/client"
import { getApplications, getApplicationStats } from "@/modules/applications/services/application.service"
import { getDocuments } from "@/modules/documents/services/document.service"
import type { Application } from "@/types/database"
import type { TimeRange } from "@/modules/analytics/services/analytics.service"

const statusConfig = {
  draft: { label: "Draft", variant: "secondary" as const },
  submitted: { label: "Submitted", variant: "secondary" as const },
  in_review: { label: "In Review", variant: "info" as const },
  interview: { label: "Interview", variant: "success" as const },
  offer: { label: "Offer", variant: "default" as const },
  rejected: { label: "Rejected", variant: "destructive" as const },
}

const priorityConfig = {
  low: { color: "bg-primary/60" },
  medium: { color: "bg-yellow-500" }, // Keep yellow as warning, or make generic. Let's keep yellow for contrast.
  high: { color: "bg-destructive" },
}

interface AnalyticsData {
  metrics: {
    total: number
    successRate: number
    averageTimeToOutcome: number | null
    interviewConversionRate: number
  }
  timeline: Array<{ date: string; count: number }>
  funnel: Array<{ stage: string; count: number; percentage: number }>
  byType: Array<{ type: string; count: number; percentage: number }>
  byPriority: Array<{ priority: string; count: number; percentage: number }>
  statusFlow: {
    nodes: Array<{ name: string; value?: number }>
    links: Array<{ source: number; target: number; value: number }>
  }
}


export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, pending: 0, upcomingDeadlines: 0 })
  const [documentsCount, setDocumentsCount] = useState(0)
  const [recentApplications, setRecentApplications] = useState<Application[]>([])
  const [statusDistribution, setStatusDistribution] = useState<Record<string, number>>({})

  // Analytics state
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  useEffect(() => {
    // Middleware already protects this route - just fetch data
    fetchData()
  }, [])

  useEffect(() => {
    // Fetch analytics data when switching to analytics tab
    if (activeTab === 'analytics' && !analyticsData) {
      fetchAnalytics()
    }
  }, [activeTab])

  useEffect(() => {
    // Refetch analytics when time range changes
    if (activeTab === 'analytics') {
      fetchAnalytics()
    }
  }, [timeRange])

  const fetchData = async () => {
    try {
      const [applicationsResult, statsResult, documentsResult] = await Promise.allSettled([
        getApplications(),
        getApplicationStats(),
        getDocuments()
      ])

      const applicationsData = applicationsResult.status === 'fulfilled' ? applicationsResult.value : []
      const statsData = statsResult.status === 'fulfilled' ? statsResult.value : null
      const documentsData = documentsResult.status === 'fulfilled' ? documentsResult.value : []

      if (applicationsResult.status === 'rejected') console.error('Error fetching applications:', applicationsResult.reason)
      if (statsResult.status === 'rejected') console.error('Error fetching stats:', statsResult.reason)
      if (documentsResult.status === 'rejected') console.error('Error fetching documents:', documentsResult.reason)

      if (statsData) setStats(statsData)
      setDocumentsCount(documentsData.length)
      setRecentApplications(applicationsData.slice(0, 4))

      // Calculate status distribution
      const distribution: Record<string, number> = {}
      applicationsData.forEach(app => {
        distribution[app.status] = (distribution[app.status] || 0) + 1
      })
      setStatusDistribution(distribution)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    try {
      setAnalyticsLoading(true)
      setAnalyticsError(null)

      const metricsRes = await fetch(`/api/analytics/metrics?timeRange=${timeRange}`)

      if (!metricsRes.ok) {
        throw new Error('Failed to fetch analytics data')
      }

      const metricsData = await metricsRes.json()

      setAnalyticsData(metricsData.data)
    } catch (err) {
      console.error('Error fetching analytics:', err)
      setAnalyticsError('Failed to load analytics data. Please try again.')
    } finally {
      setAnalyticsLoading(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    )
  }

  const statsCards = [
    {
      title: "Total Applications",
      value: stats.total.toString(),
      icon: FileText,
      color: "text-foreground",
    },
    {
      title: "In Review",
      value: stats.pending.toString(),
      icon: Clock,
      color: "text-muted-foreground",
    },
    {
      title: "Upcoming Deadlines",
      value: stats.upcomingDeadlines.toString(),
      icon: AlertCircle,
      color: "text-destructive",
    },
    {
      title: "Documents Uploaded",
      value: documentsCount.toString(),
      icon: CheckCircle,
      color: "text-foreground",
    },
  ]

  return (
    <DashboardLayout>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2 tracking-tight">Dashboard</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Welcome back! Here&apos;s an overview of your applications.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="analytics"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Analytics
                </TabsTrigger>
              </TabsList>
              <Button
                className="glow-effect w-full sm:w-auto"
                asChild
              >
                <Link href="/applications">
                  Add Application
                </Link>
              </Button>
            </div>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-8 mt-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
              {statsCards.map((stat, index) => {
                const Icon = stat.icon
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Card className="hover:border-primary/40 transition-all">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
                        <CardTitle className="text-xs sm:text-sm font-medium">
                          {stat.title}
                        </CardTitle>
                        <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${stat.color} opacity-90 stroke-[1.5]`} />
                      </CardHeader>
                      <CardContent className="p-4 sm:p-6 pt-0">
                        <div className="text-xl sm:text-2xl font-bold">{stat.value}</div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>

            {/* Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Application Status</CardTitle>
                <CardDescription>
                  Distribution of your current applications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(statusDistribution).map(([status, count]) => {
                  const total = stats.total
                  const percentage = total > 0 ? (count / total) * 100 : 0

                  return (
                    <div key={status} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="h-3 w-3 rounded-full bg-primary" />
                          <span className="text-sm capitalize">{status.replace('_', ' ')}</span>
                        </div>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Recent Applications */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Applications</CardTitle>
                <CardDescription>
                  Your most recent application activity
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentApplications.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No applications yet. Create your first application to get started!
                    </p>
                  ) : (
                    recentApplications.map((app, index) => (
                      <motion.div
                        key={app.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                      >
                        <Link href={`/applications/${app.id}`}>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 rounded-lg border border-border hover:border-primary/40 transition-all cursor-pointer">
                            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                                <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm sm:text-base font-medium truncate">{app.title}</h4>
                                {app.company && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{app.company}</p>
                                )}
                                <div className="flex items-center gap-1.5 sm:gap-2 mt-1">
                                  <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-xs text-muted-foreground truncate">
                                    {app.deadline
                                      ? `Deadline: ${new Date(app.deadline).toLocaleDateString()}`
                                      : 'No deadline set'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto">
                              <Badge variant={statusConfig[app.status].variant} className="text-xs">
                                {statusConfig[app.status].label}
                              </Badge>
                              <div
                                className={`h-2 w-2 rounded-full shrink-0 ${priorityConfig[app.priority].color}`}
                              />
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6 mt-6">
            {/* Time Range Selector */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Analytics</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Comprehensive insights into your application journey
                </p>
              </div>

              <Tabs value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
                <TabsList>
                  <TabsTrigger value="7d">7 Days</TabsTrigger>
                  <TabsTrigger value="30d">30 Days</TabsTrigger>
                  <TabsTrigger value="90d">90 Days</TabsTrigger>
                  <TabsTrigger value="all">All Time</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Error State */}
            {analyticsError && (
              <Card className="border-destructive">
                <CardContent className="flex items-center gap-2 py-4 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <span>{analyticsError}</span>
                </CardContent>
              </Card>
            )}

            {/* Loading State */}
            {analyticsLoading ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader className="space-y-0 pb-2">
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </CardHeader>
                      <CardContent>
                        <div className="h-8 bg-muted animate-pulse rounded" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card>
                  <CardHeader>
                    <div className="h-6 w-48 bg-muted animate-pulse rounded" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px] bg-muted animate-pulse rounded" />
                  </CardContent>
                </Card>
              </div>
            ) : (
              analyticsData && (
                <>
                  {/* KPI Cards */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <MetricsCard
                      title="Total Applications"
                      value={analyticsData.metrics.total}
                      icon={Briefcase}
                      subtitle={`${timeRange === 'all' ? 'All time' : `Last ${timeRange}`}`}
                    />
                    <MetricsCard
                      title="Success Rate"
                      value={`${analyticsData.metrics.successRate}%`}
                      icon={Award}
                      subtitle="Offers received"
                    />
                    <MetricsCard
                      title="Avg Time to Outcome"
                      value={
                        analyticsData.metrics.averageTimeToOutcome
                          ? `${analyticsData.metrics.averageTimeToOutcome} days`
                          : 'N/A'
                      }
                      icon={Clock}
                      subtitle="From submission to decision"
                    />
                    <MetricsCard
                      title="Interview Rate"
                      value={`${analyticsData.metrics.interviewConversionRate}%`}
                      icon={Target}
                      subtitle="Submissions to interviews"
                    />
                  </div>

                  {/* Sankey Diagram */}
                  <SankeyChart
                    data={analyticsData.statusFlow}
                    title="Application Status Flow"
                  />

                  {/* Timeline and Funnel */}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="min-h-[400px]">
                      <TimelineChart
                        data={analyticsData.timeline}
                        title="Applications Over Time"
                      />
                    </div>
                    <div className="min-h-[400px]">
                      <ConversionFunnel
                        data={analyticsData.funnel}
                        title="Application Conversion Funnel"
                      />
                    </div>
                  </div>

                  {/* Type and Priority Breakdown */}
                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* By Type */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Applications by Type</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {analyticsData.byType.length > 0 ? (
                          <div className="space-y-4">
                            {analyticsData.byType.map((item) => (
                              <div key={item.type}>
                                <div className="flex items-center justify-between text-sm mb-2">
                                  <span className="font-medium">{item.type}</span>
                                  <span className="text-muted-foreground">
                                    {item.count} ({item.percentage}%)
                                  </span>
                                </div>
                                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary transition-all duration-500"
                                    style={{ width: `${item.percentage}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            No type data available
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* By Priority */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Applications by Priority</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {analyticsData.byPriority.length > 0 ? (
                          <div className="space-y-4">
                            {analyticsData.byPriority.map((item) => {
                              const priorityColor =
                                item.priority === 'High'
                                  ? 'bg-destructive'
                                  : item.priority === 'Medium'
                                    ? 'bg-yellow-500'
                                    : 'bg-primary/60'

                              return (
                                <div key={item.priority}>
                                  <div className="flex items-center justify-between text-sm mb-2">
                                    <span className="font-medium">{item.priority}</span>
                                    <span className="text-muted-foreground">
                                      {item.count} ({item.percentage}%)
                                    </span>
                                  </div>
                                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${priorityColor} transition-all duration-500`}
                                      style={{ width: `${item.percentage}%` }}
                                    />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            No priority data available
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )
            )}
          </TabsContent>
        </div>
      </Tabs>
    </DashboardLayout>
  )
}
