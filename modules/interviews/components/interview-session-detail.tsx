"use client"

import { useState, useEffect } from "react"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { Textarea } from "@/shared/ui/textarea"
import { Badge } from "@/shared/ui/badge"
import { Progress } from "@/shared/ui/progress"
import { useToast } from "@/shared/ui/use-toast"
import {
  Mic,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Trophy,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  AlertCircle,
  RefreshCcw,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { InterviewSession, InterviewQuestion, InterviewAnswer } from "@/types/database"
import { getInterviewSession, getQuestionsForSession, getAnswersForSession } from "@/modules/interviews/services/interview.service"
import { VoiceRecorder } from "@/modules/interviews/components/VoiceRecorder"
import { Keyboard } from "lucide-react"
import { ConfirmDialog } from "@/shared/ui/confirm-dialog"

interface InterviewSessionDetailProps {
  sessionId: string
  onComplete?: () => void
  onBack?: () => void
}

interface QuestionWithAnswer extends InterviewQuestion {
  answer?: InterviewAnswer
}

export function InterviewSessionDetail({ sessionId, onComplete, onBack }: InterviewSessionDetailProps) {
  const { toast } = useToast()
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [questions, setQuestions] = useState<QuestionWithAnswer[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answerText, setAnswerText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [currentFeedback, setCurrentFeedback] = useState<InterviewAnswer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text')
  const [isReviewMode, setIsReviewMode] = useState(false)
  const [showRetryDialog, setShowRetryDialog] = useState(false)

  const MAX_ANSWER_LENGTH = 5000
  const characterCount = answerText.length
  const isOverLimit = characterCount > MAX_ANSWER_LENGTH

  // Load session data
  useEffect(() => {
    const loadSession = async () => {
      setLoading(true)
      setError(null)

      try {
        const [sessionData, questionsData, answersData] = await Promise.all([
          getInterviewSession(sessionId),
          getQuestionsForSession(sessionId),
          getAnswersForSession(sessionId),
        ])

        setSession(sessionData)

        // Map answers to questions
        const questionsWithAnswers = questionsData.map((q) => ({
          ...q,
          answer: answersData.find((a) => a.question_id === q.id),
        }))

        setQuestions(questionsWithAnswers)

        // Find first unanswered question
        const firstUnanswered = questionsWithAnswers.findIndex((q) => !q.answer)
        if (firstUnanswered !== -1) {
          setCurrentQuestionIndex(firstUnanswered)
        } else if (questionsWithAnswers.length > 0) {
          // All answered, show last question
          setCurrentQuestionIndex(questionsWithAnswers.length - 1)
        }
      } catch (err) {
        console.error("Error loading interview session:", err)
        setError(err instanceof Error ? err.message : "Failed to load interview session")
      } finally {
        setLoading(false)
      }
    }

    loadSession()
  }, [sessionId])

  const currentQuestion = questions[currentQuestionIndex]
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0
  const answeredCount = questions.filter((q) => q.answer).length
  const allAnswered = answeredCount === questions.length && questions.length > 0

  const handleSubmitAnswer = async () => {
    if (!answerText.trim() || !currentQuestion) return

    setSubmitting(true)
    setError(null)

    try {
      const startTime = Date.now()

      const response = await fetch("/api/interview/submit-answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          questionId: currentQuestion.id,
          sessionId: sessionId,
          answerText: answerText.trim(),
          answerType: "text",
          timeTakenSeconds: Math.round((Date.now() - startTime) / 1000),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit answer")
      }

      // Update questions with new answer
      const updatedQuestions = [...questions]
      updatedQuestions[currentQuestionIndex] = {
        ...currentQuestion,
        answer: data.answer,
      }
      setQuestions(updatedQuestions)

      // Show feedback
      setCurrentFeedback(data.answer)
      setShowFeedback(true)
      setAnswerText("")

      // Show success toast
      const avgScore = (
        (data.answer.clarity_score || 0) +
        (data.answer.structure_score || 0) +
        (data.answer.relevance_score || 0) +
        (data.answer.depth_score || 0) +
        (data.answer.confidence_score || 0)
      ) / 5

      toast({
        title: "Answer Submitted!",
        description: `Your answer scored ${avgScore.toFixed(1)}/10. Check the feedback below.`,
        duration: 4000,
      })

      // Reload session to update statistics
      const updatedSession = await getInterviewSession(sessionId)
      setSession(updatedSession)
    } catch (err) {
      console.error("Error submitting answer:", err)
      const message = err instanceof Error ? err.message : "Failed to submit answer"
      setError(message)

      toast({
        title: "Submission Failed",
        description: message || "Failed to submit answer. Please try again.",
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleVoiceTranscription = (transcription: string) => {
    setAnswerText(transcription)
    toast({
      title: "Transcription Complete",
      description: "Your voice answer has been transcribed. Review and submit when ready.",
      duration: 3000,
    })
  }

  const handleVoiceError = (error: Error) => {
    toast({
      title: "Voice Recording Error",
      description: error.message || "Failed to record or transcribe audio. Please try again.",
      variant: "destructive",
      duration: 5000,
    })
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1
      setCurrentQuestionIndex(nextIndex)

      if (isReviewMode) {
        // In review mode, show feedback for the next question immediately
        const nextQuestion = questions[nextIndex]
        if (nextQuestion.answer) {
          setCurrentFeedback(nextQuestion.answer)
          setShowFeedback(true)
        } else {
          // Should not happen in review mode if all answered, but fallback
          setShowFeedback(false)
          setCurrentFeedback(null)
        }
      } else {
        // Normal mode
        setShowFeedback(false)
        setCurrentFeedback(null)
        setAnswerText("")
      }
    }
  }

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
      setShowFeedback(false)
      setCurrentFeedback(null)
      setAnswerText("")
    }
  }

  const handleViewAnswer = (question: QuestionWithAnswer) => {
    if (question.answer) {
      setCurrentFeedback(question.answer)
      setShowFeedback(true)
    }
  }

  const handleComplete = () => {
    if (onComplete) {
      onComplete()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">Error</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            {onBack && (
              <Button onClick={onBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!session || questions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground">No questions found for this session.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Completion screen
  if ((allAnswered || session?.status === 'completed') && !showFeedback) {
    const avgScore = session.average_score || 0
    const scoreColor = avgScore >= 8 ? "text-green-500" : avgScore >= 6 ? "text-yellow-500" : "text-red-500"

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-6"
      >
        <ConfirmDialog
          open={showRetryDialog}
          title="Retry Interview?"
          description="This will delete all your current answers and score for this session. You will be able to start over from the beginning."
          confirmLabel="Yes, Retry"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={async () => {
            try {
              setLoading(true)
              const response = await fetch('/api/interview/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
              })

              if (!response.ok) throw new Error('Failed to reset session')

              // Reload the page to reset state and show mode selection
              window.location.reload()
            } catch (err) {
              console.error('Error resetting session:', err)
              toast({
                title: "Error",
                description: "Failed to reset session. Please try again.",
                variant: "destructive",
              })
              setLoading(false)
            }
          }}
          onCancel={() => setShowRetryDialog(false)}
        />
        <Card className="border-2 border-primary">
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <Trophy className="h-16 w-16 text-primary" />
            </div>
            <CardTitle className="text-center text-2xl">Interview Complete!</CardTitle>
            <CardDescription className="text-center">
              Great job! You&apos;ve answered all {questions.length} questions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Overall Score */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Overall Score</p>
              <p className={`text-5xl font-bold ${scoreColor}`}>{avgScore.toFixed(1)}</p>
              <p className="text-sm text-muted-foreground">out of 10</p>
            </div>

            {/* Score Breakdown */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{answeredCount}</p>
                <p className="text-sm text-muted-foreground">Questions Answered</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">
                  {Math.round((session.total_duration_seconds || 0) / 60)}m
                </p>
                <p className="text-sm text-muted-foreground">Total Time</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 pt-4">
              <Button
                onClick={() => {
                  setIsReviewMode(true)
                  setCurrentQuestionIndex(0)
                  if (questions[0]?.answer) {
                    handleViewAnswer(questions[0])
                  }
                }}
                className="w-full"
              >
                <Lightbulb className="h-4 w-4 mr-2" />
                Review Answers & Feedback
              </Button>
              <Button onClick={handleComplete} variant="outline" className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Finish Interview
              </Button>

              <Button
                onClick={() => setShowRetryDialog(true)}
                variant="outline"
                className="w-full hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Retry Interview
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={showRetryDialog}
        title="Retry Interview?"
        description="This will delete all your current answers and score for this session. You will be able to start over from the beginning."
        confirmLabel="Yes, Retry"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={async () => {
          try {
            setLoading(true)
            const response = await fetch('/api/interview/reset', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            })

            if (!response.ok) throw new Error('Failed to reset session')

            // Reload the page to reset state and show mode selection
            window.location.reload()
          } catch (err) {
            console.error('Error resetting session:', err)
            toast({
              title: "Error",
              description: "Failed to reset session. Please try again.",
              variant: "destructive",
            })
            setLoading(false)
          }
        }}
        onCancel={() => setShowRetryDialog(false)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Mic className="h-6 w-6" />
              Interview Session
            </h2>
            <p className="text-sm text-muted-foreground capitalize">
              {session.session_type.replace("_", " ")} • {session.difficulty}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-sm">
          {answeredCount} / {questions.length} Answered
        </Badge>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Question Card */}
      <AnimatePresence mode="wait">
        {!showFeedback ? (
          <motion.div
            key={`question-${currentQuestion?.id}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Card className="border-2">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {currentQuestion?.difficulty || "medium"}
                    </Badge>
                    {currentQuestion?.answer && (
                      <Badge variant="default">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Answered
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="text-base pt-2">
                  {currentQuestion?.question_text}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Answer Input */}
                {!currentQuestion?.answer ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Your Answer</label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={inputMode === 'text' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setInputMode('text')}
                            className="gap-2"
                          >
                            <Keyboard className="h-4 w-4" />
                            Text
                          </Button>
                          <Button
                            type="button"
                            variant={inputMode === 'voice' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setInputMode('voice')}
                            className="gap-2"
                          >
                            <Mic className="h-4 w-4" />
                            Voice
                          </Button>
                        </div>
                      </div>

                      {inputMode === 'text' ? (
                        <>
                          <Textarea
                            value={answerText}
                            onChange={(e) => setAnswerText(e.target.value)}
                            placeholder="Type your answer here... Use the STAR method for behavioral questions."
                            className={`min-h-[200px] resize-none ${isOverLimit ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                            disabled={submitting}
                            maxLength={MAX_ANSWER_LENGTH + 100}
                          />
                          <div className="flex justify-between items-center">
                            <p className="text-xs text-muted-foreground">
                              Aim for clear, structured responses
                            </p>
                            <p className={`text-xs font-medium ${isOverLimit ? 'text-destructive' :
                              characterCount > MAX_ANSWER_LENGTH * 0.9 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-muted-foreground'
                              }`}>
                              {characterCount} / {MAX_ANSWER_LENGTH}
                            </p>
                          </div>
                          {isOverLimit && (
                            <p className="text-xs text-destructive flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Answer exceeds recommended length. Consider being more concise.
                            </p>
                          )}
                        </>
                      ) : (
                        <VoiceRecorder
                          onTranscriptionReceived={handleVoiceTranscription}
                          onError={handleVoiceError}
                          disabled={submitting}
                        />
                      )}
                    </div>

                    {error && (
                      <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                        {error}
                      </div>
                    )}

                    <Button
                      onClick={handleSubmitAnswer}
                      disabled={!answerText.trim() || submitting || isOverLimit}
                      className="w-full glow-effect"
                      title={isOverLimit ? "Answer exceeds recommended length" : undefined}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Evaluating...
                        </>
                      ) : isOverLimit ? (
                        <>
                          <AlertCircle className="mr-2 h-4 w-4" />
                          Answer Too Long
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Submit Answer
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-muted p-4 rounded-lg">
                      <p className="text-sm font-medium mb-2">Your Answer:</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {currentQuestion.answer.answer_text}
                      </p>
                    </div>
                    <Button onClick={() => handleViewAnswer(currentQuestion)} className="w-full">
                      View Feedback
                    </Button>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={handlePreviousQuestion}
                    disabled={currentQuestionIndex === 0}
                    className="flex-1"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleNextQuestion}
                    disabled={currentQuestionIndex === questions.length - 1}
                    className="flex-1"
                  >
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key={`feedback-${currentFeedback?.id}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {currentFeedback && (
              <>
                {/* Score Card */}
                <Card className="border-2 border-primary">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Your Score</span>
                      <span className="text-4xl font-bold text-primary">
                        {currentFeedback.score.toFixed(1)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { label: "Clarity", score: currentFeedback.clarity_score || 0 },
                        { label: "Structure", score: currentFeedback.structure_score || 0 },
                        { label: "Relevance", score: currentFeedback.relevance_score || 0 },
                        { label: "Depth", score: currentFeedback.depth_score || 0 },
                        { label: "Confidence", score: currentFeedback.confidence_score || 0 },
                      ].map((item) => (
                        <div key={item.label} className="text-center">
                          <p className="text-2xl font-bold text-primary">{item.score.toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Feedback Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>AI Feedback</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4 mb-6">
                      <div className="bg-muted/50 p-4 rounded-lg">
                        <p className="text-sm font-semibold mb-1">Question:</p>
                        <p className="text-sm text-muted-foreground">{currentQuestion.question_text}</p>
                      </div>
                      <div className="bg-muted p-4 rounded-lg">
                        <p className="text-sm font-semibold mb-1">Your Answer:</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {currentFeedback.answer_text}
                        </p>
                      </div>
                    </div>

                    {/* General Feedback - Display first */}
                    {currentFeedback.feedback.overall && (
                      <div className="pb-4 border-b">
                        <h4 className="text-sm font-semibold mb-2">General Feedback</h4>
                        <p className="text-sm text-muted-foreground">
                          {currentFeedback.feedback.overall}
                        </p>
                      </div>
                    )}

                    {/* Strengths */}
                    {currentFeedback.feedback.strengths && currentFeedback.feedback.strengths.length > 0 && (
                      <div className="pb-4 border-b">
                        <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          Strengths
                        </h4>
                        <ul className="space-y-1">
                          {currentFeedback.feedback.strengths.map((strength: string, i: number) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <span>{strength}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Tone Analysis */}
                    {currentFeedback.feedback.tone_analysis && (
                      <div className="pb-4 border-b">
                        <h4 className="text-sm font-semibold mb-2">Tone Analysis</h4>
                        <p className="text-sm text-muted-foreground italic">&quot;{currentFeedback.feedback.tone_analysis}&quot;</p>
                      </div>
                    )}

                    {/* Areas for Improvement */}
                    {currentFeedback.feedback.weaknesses && currentFeedback.feedback.weaknesses.length > 0 && (
                      <div className="pb-4 border-b">
                        <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                          <TrendingDown className="h-4 w-4 text-yellow-500" />
                          Areas for Improvement
                        </h4>
                        <ul className="space-y-1">
                          {currentFeedback.feedback.weaknesses.map((weakness: string, i: number) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                              <span>{weakness}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Suggestions */}
                    {currentFeedback.feedback.suggestions && currentFeedback.feedback.suggestions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                          <Lightbulb className="h-4 w-4 text-blue-500" />
                          Suggestions
                        </h4>
                        <ul className="space-y-1">
                          {currentFeedback.feedback.suggestions.map((suggestion: string, i: number) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <ArrowRight className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                              <span>{suggestion}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Rubric scores (if available in new format) */}
                    {currentFeedback.feedback.rubric && (
                      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
                        {Object.entries(currentFeedback.feedback.rubric).map(([key, score]) => (
                          <div key={key} className="flex flex-col">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="capitalize text-muted-foreground">{key}</span>
                              <span className="font-semibold">{Number(score)}/10</span>
                            </div>
                            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary/70 rounded-full"
                                style={{ width: `${(Number(score) / 10) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      onClick={() => {
                        if (currentQuestionIndex < questions.length - 1) {
                          handleNextQuestion()
                        } else {
                          // Finish review
                          setShowFeedback(false)
                          setCurrentFeedback(null)
                          setIsReviewMode(false)
                        }
                      }}
                      className="w-full"
                    >
                      {currentQuestionIndex < questions.length - 1 ? (
                        <>
                          Next Question
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Finish Review
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
