"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { motion } from "framer-motion"
import {
  Mic,
  TrendingUp,
  Target,
  Award,
  Clock,
  BarChart3,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react"
import Link from "next/link"
import type { InterviewSession, Application } from "@/types/database"
import { createClient } from "@/shared/db/supabase/client"
import { Button } from "@/shared/ui/button"
import { useToast } from "@/shared/ui/use-toast"
import { ConfirmDialog } from "@/shared/ui/confirm-dialog"

interface SessionWithApplication extends InterviewSession {
  application: Application | null
}

export default function InterviewPage() {
  const { toast } = useToast()
  const [sessions, setSessions] = useState<SessionWithApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")
  const [retrySessionId, setRetrySessionId] = useState<string | null>(null)

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      // Fetch all interview sessions with their applications
      const { data: sessionsData, error } = await supabase
        .from('interview_sessions')
        .select(`
          *,
          application:applications(*),
          db_total_questions,
          db_answered_questions,
          db_average_score
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const mappedSessions = (sessionsData || []).map((session: SessionWithApplication & {
        db_total_questions?: number | null
        db_answered_questions?: number | null
        db_average_score?: number | null
      }) => ({
        ...session,
        total_questions: session.db_total_questions ?? session.total_questions,
        answered_questions: session.db_answered_questions ?? session.answered_questions,
        average_score: session.db_average_score ?? session.average_score,
      }))

      setSessions(mappedSessions)
    } catch (err) {
      console.error('Error loading interview sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRetryClick = (e: React.MouseEvent, sessionId: string) => {
    console.log("Retry button clicked for session:", sessionId)
    e.preventDefault()
    e.stopPropagation()
    setRetrySessionId(sessionId)
  }

  const handleConfirmRetry = async () => {
    console.log("Confirm retry for session:", retrySessionId)
    if (!retrySessionId) return

    try {
      console.log("Calling reset API...")
      const response = await fetch('/api/interview/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: retrySessionId }),
      })

      console.log("Reset API response status:", response.status)

      if (!response.ok) throw new Error('Failed to reset session')

      toast({
        title: "Session Reset",
        description: "The interview session has been reset. You can now start over.",
      })

      loadSessions()
    } catch (err) {
      console.error('Error resetting session:', err)
      toast({
        title: "Error",
        description: "Failed to reset session. Please try again.",
        variant: "destructive",
      })
    } finally {
      setRetrySessionId(null)
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

  // Calculate statistics
  const totalSessions = sessions.length
  const completedSessions = sessions.filter(s => s.status === 'completed').length
  const totalQuestionsAnswered = sessions.reduce((sum, s) => sum + s.answered_questions, 0)
  const averageScore = sessions.length > 0
    ? sessions.reduce((sum, s) => sum + (s.average_score || 0), 0) / sessions.length
    : 0
  const totalTimeSpent = sessions.reduce((sum, s) => sum + (s.total_duration_seconds || 0), 0)

  // Group sessions by type
  const sessionsByType = sessions.reduce((acc, session) => {
    const type = session.session_type
    if (!acc[type]) acc[type] = []
    acc[type].push(session)
    return acc
  }, {} as Record<string, SessionWithApplication[]>)

  const sessionTypeLabels: Record<string, string> = {
    behavioral: "Behavioral",
    technical: "Technical",
    mixed: "Mixed",
    resume_grill: "Resume Grill",
    company_specific: "Company-Specific"
  }

  const difficultyColors = {
    easy: "bg-green-500/10 text-green-700 dark:text-green-400",
    medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    hard: "bg-red-500/10 text-red-700 dark:text-red-400"
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Mic className="h-8 w-8" />
              Interview Practice
            </h1>
            <p className="text-muted-foreground mt-2">
              Track your interview preparation progress across all applications
            </p>
          </div>
          <Link href="/interview/star" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto">
              <Sparkles className="mr-2 h-4 w-4" />
              STAR Answer Builder
            </Button>
          </Link>
        </div>

        {sessions.length === 0 ? (
          // Empty State
          <Card className="border-2">
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Mic className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="text-lg font-semibold mb-2">No Interview Sessions Yet</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                  Start practicing your interview skills by creating an interview session from any application.
                </p>
                <Link href="/applications">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                    Go to Applications
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardDescription>Total Sessions</CardDescription>
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalSessions}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {completedSessions} completed
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardDescription>Questions Answered</CardDescription>
                      <Target className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalQuestionsAnswered}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Across all sessions
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardDescription>Average Score</CardDescription>
                      <Award className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${averageScore >= 8 ? 'text-green-600 dark:text-green-400' :
                      averageScore >= 6 ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                      {averageScore.toFixed(1)}/10
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Overall performance
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
              >
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardDescription>Time Spent</CardDescription>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {Math.floor(totalTimeSpent / 60)}m
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Total practice time
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 }}
              >
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardDescription>Improvement</CardDescription>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      +{((completedSessions / Math.max(totalSessions, 1)) * 100).toFixed(0)}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Completion rate
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                <TabsTrigger value="overview">All Sessions</TabsTrigger>
                <TabsTrigger value="by-type">By Type</TabsTrigger>
              </TabsList>

              {/* All Sessions Tab */}
              <TabsContent value="overview" className="space-y-4 mt-6">
                <div className="grid grid-cols-1 gap-4">
                  {sessions.map((session) => {
                    const progress = session.total_questions > 0
                      ? (session.answered_questions / session.total_questions) * 100
                      : 0
                    const avgScore = session.average_score || 0

                    return (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        whileHover={{ scale: 1.01 }}
                      >
                        <Link href={`/interview/${session.id}/report`}>
                          <Card className="group cursor-pointer hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 relative overflow-hidden bg-card/50 backdrop-blur-sm">
                            {/* Gradient overlay on hover */}
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-2">
                                    <CardTitle className="text-lg font-bold">
                                      {sessionTypeLabels[session.session_type] || session.session_type}
                                    </CardTitle>
                                    {session.company_name && (
                                      <Badge variant="outline" className="text-xs font-medium">
                                        {session.company_name}
                                      </Badge>
                                    )}
                                  </div>
                                  <CardDescription className="text-xs">
                                    {session.application?.title || 'Unknown Application'} •{' '}
                                    {new Date(session.created_at).toLocaleDateString()}
                                  </CardDescription>
                                </div>
                                <div className="flex flex-col gap-2 items-end shrink-0">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className={`capitalize font-semibold ${session.difficulty ? difficultyColors[session.difficulty] : ''}`}
                                    >
                                      {session.difficulty || 'medium'}
                                    </Badge>
                                    {(session.status === 'completed' || progress === 100) && (
                                      <Badge className="bg-green-600 text-white border-0 shadow-sm">
                                        ✓ Completed
                                      </Badge>
                                    )}
                                  </div>
                                  {session.answered_questions > 0 && (
                                    <div className="flex items-center gap-1.5">
                                      <div className={`flex items-center justify-center h-7 w-7 rounded-full ${avgScore >= 8 ? 'bg-green-500/10 border border-green-500/30' :
                                        avgScore >= 6 ? 'bg-yellow-500/10 border border-yellow-500/30' :
                                          'bg-red-500/10 border border-red-500/30'
                                        }`}>
                                        <span className={`text-xs font-bold ${avgScore >= 8 ? 'text-green-600 dark:text-green-400' :
                                          avgScore >= 6 ? 'text-yellow-600 dark:text-yellow-400' :
                                            'text-red-600 dark:text-red-400'
                                          }`}>
                                          {avgScore.toFixed(1)}
                                        </span>
                                      </div>
                                      <span className="text-xs text-muted-foreground font-medium">Avg Score</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardHeader>

                            <CardContent className="space-y-2 pb-4">
                              {/* Progress Section */}
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-muted-foreground font-medium">Progress</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground">
                                      {session.answered_questions} / {session.total_questions}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      ({Math.round(progress)}%)
                                    </span>
                                  </div>
                                </div>
                                <div className="relative h-2.5 w-full bg-secondary/50 rounded-full overflow-hidden border border-border/50">
                                  <div
                                    className="h-full bg-gradient-to-r from-primary via-primary to-primary/80 transition-all duration-500 ease-out relative"
                                    style={{ width: `${progress}%` }}
                                  >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      </motion.div>
                    )
                  })}
                </div>
              </TabsContent>

              {/* By Type Tab */}
              <TabsContent value="by-type" className="space-y-6 mt-6">
                {Object.entries(sessionsByType).map(([type, typeSessions]) => (
                  <div key={type} className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {sessionTypeLabels[type] || type}
                      <Badge variant="outline">{typeSessions.length} session{typeSessions.length !== 1 ? 's' : ''}</Badge>
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {typeSessions.map((session) => {
                        const progress = session.total_questions > 0
                          ? (session.answered_questions / session.total_questions) * 100
                          : 0
                        const avgScore = session.average_score || 0

                        return (
                          <Link key={session.id} href={`/interview/${session.id}/report`}>
                            <Card className="group cursor-pointer hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 relative overflow-hidden bg-card/50 backdrop-blur-sm">
                              {/* Gradient overlay on hover */}
                              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                              <CardContent className="pt-4 pb-4">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold truncate">{session.application?.title || 'Unknown Application'}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(session.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {(session.status === 'completed' || progress === 100) && (
                                      <Badge className="bg-green-600 text-white border-0 shadow-sm text-xs">
                                        ✓
                                      </Badge>
                                    )}
                                    {session.answered_questions > 0 && (
                                      <div className={`flex items-center justify-center h-8 w-8 rounded-full ${avgScore >= 8 ? 'bg-green-500/10 border border-green-500/30' :
                                        avgScore >= 6 ? 'bg-yellow-500/10 border border-yellow-500/30' :
                                          'bg-red-500/10 border border-red-500/30'
                                        }`}>
                                        <span className={`text-xs font-bold ${avgScore >= 8 ? 'text-green-600 dark:text-green-400' :
                                          avgScore >= 6 ? 'text-yellow-600 dark:text-yellow-400' :
                                            'text-red-600 dark:text-red-400'
                                          }`}>
                                          {avgScore.toFixed(1)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="relative h-2 w-full bg-secondary/50 rounded-full overflow-hidden border border-border/50">
                                  <div
                                    className="h-full bg-gradient-to-r from-primary via-primary to-primary/80 transition-all duration-500 ease-out relative"
                                    style={{ width: `${progress}%` }}
                                  >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="pt-3 flex justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                                    onClick={(e) => handleRetryClick(e, session.id)}
                                  >
                                    <RefreshCcw className="h-3 w-3 mr-1" />
                                    Retry
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!retrySessionId}
        title="Retry Interview?"
        description="This will delete all your current answers and score for this session. You will be able to start over from the beginning."
        confirmLabel="Yes, Retry"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleConfirmRetry}
        onCancel={() => setRetrySessionId(null)}
      />
    </DashboardLayout>
  )
}
