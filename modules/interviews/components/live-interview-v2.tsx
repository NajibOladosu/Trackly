'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/shared/ui/button'
import { AIOrb } from './ai-orb'
import type { OrbMode } from './ai-orb'
import { AlertCircle } from 'lucide-react'
import { GeminiLiveClient } from '@/lib/gemini-live/client'
import type { ConnectionState, BufferedTurn } from '@/lib/gemini-live/types'
import type { ConversationTurn } from '@/types/database'
import { motion, AnimatePresence } from 'framer-motion'
import { InterviewReportModal, type InterviewReportData } from '@/modules/interviews/components/modals/interview-report-modal'
import type { InterviewQuestion } from '@/types/database'
import { useRouter } from 'next/navigation'

interface LiveInterviewProps {
  sessionId: string
  onComplete?: (transcript: ConversationTurn[]) => void
  onError?: (error: Error) => void
}

export function LiveInterview({ sessionId, onComplete, onError }: LiveInterviewProps) {
  const _router = useRouter()

  // Interview state
  const [interviewState, setInterviewState] = useState<'idle' | 'starting' | 'active' | 'ending' | 'completed' | 'generating-report'>('idle')
  const [_connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [_client, setClient] = useState<GeminiLiveClient | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Auto-termination state
  const [aiSignaledCompletion, setAiSignaledCompletion] = useState(false)
  const [_totalQuestions, setTotalQuestions] = useState(0)

  // Report state
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportData, setReportData] = useState<InterviewReportData | null>(null)
  const [_generatingReport, setGeneratingReport] = useState(false)

  // Recording state
  const [_isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)

  // Transcript state
  const [transcript, setTranscript] = useState<ConversationTurn[]>([])
  const [_currentAIMessage, setCurrentAIMessage] = useState<string>('')
  const [currentAITranscription, setCurrentAITranscription] = useState<string>('')
  const [_currentUserTranscription, setCurrentUserTranscription] = useState<string>('')

  // Turn buffering
  const [turnBuffer, setTurnBuffer] = useState<BufferedTurn[]>([])
  const [turnCount, setTurnCount] = useState(0)
  const FLUSH_THRESHOLD = 8

  // Audio refs
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const playbackContextRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef<number>(0)
  const clientRef = useRef<GeminiLiveClient | null>(null)
  const isAITurnCompleteRef = useRef<boolean>(false)
  const userAnswerAccumulator = useRef<string>('')

  const [_questions, setQuestions] = useState<InterviewQuestion[]>([])
  const [_currentQuestionIndex, setCurrentQuestionIndex] = useState(0)

  // Refs for state accessible in callbacks
  const questionsRef = useRef<InterviewQuestion[]>([])
  const currentQuestionIndexRef = useRef(0)
  const aiTurnCounterRef = useRef(0)
  const isAudioPlayingRef = useRef(false)
  const orbModeRef = useRef<OrbMode>('idle')

  // Orb mode
  const [orbMode, setOrbMode] = useState<OrbMode>('idle')

  // Wrapper function to update both state and ref
  const updateOrbMode = useCallback((newMode: OrbMode) => {
    orbModeRef.current = newMode
    setOrbMode(newMode)
  }, [])

  /**
   * Start the interview
   */
  const startInterview = async () => {
    try {
      setInterviewState('starting')
      setConnectionState('connecting')
      setError(null)

      // Cleanup previous session if exists
      if (clientRef.current) {
        console.log('[Interview] Cleaning up previous session before starting new one')
        clientRef.current.disconnect()
        clientRef.current = null
        setClient(null)
      }
      stopRecording()
      setTranscript([])
      setTurnBuffer([])
      setTurnCount(0)
      setCurrentAITranscription('')
      setCurrentUserTranscription('')
      isAITurnCompleteRef.current = false
      userAnswerAccumulator.current = ''
      setCurrentQuestionIndex(0)

      // Initialize AudioContext for playback (must be created in user gesture)
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext()
        nextPlayTimeRef.current = playbackContextRef.current.currentTime

        // Resume if suspended
        if (playbackContextRef.current.state === 'suspended') {
          await playbackContextRef.current.resume()
        }
      }

      // Call init endpoint
      const response = await fetch('/api/interview/live-session/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to initialize session')
      }

      const { token, systemInstruction, model, tools, questions: fetchedQuestions } = await response.json()

      // Store questions and total count
      setQuestions(fetchedQuestions)
      questionsRef.current = fetchedQuestions
      setTotalQuestions(fetchedQuestions.length)

      // Reset index
      setCurrentQuestionIndex(0)
      currentQuestionIndexRef.current = 0
      aiTurnCounterRef.current = 0

      // Create WebSocket client
      const wsClient = new GeminiLiveClient(
        { token, systemInstruction, model, tools },
        {
          onConnected: () => {
            setConnectionState('connected')
            setInterviewState('active')
          },
          onDisconnected: () => {
            setConnectionState('disconnected')
            setOrbMode('idle')
            stopRecording()
          },
          onError: (error) => {
            setError(error.message)
            setConnectionState('error')
            setInterviewState('idle')
            setOrbMode('idle')
            onError?.(error)
          },
          onSetupComplete: () => {
            // Send initial message to begin interview FIRST
            if (clientRef.current) {
              clientRef.current.sendText('Hello! I am ready for the interview. Please introduce yourself and ask the first question.')
              setOrbMode('ai')
            }

            // Start audio streaming slightly after to ensure the text turn is processed as the primary trigger
            // This prevents background noise from "interrupting" the start command
            setTimeout(() => {
              startRecording()
            }, 500)
          },
          onTextResponse: (text) => {
            // Keep for fallback/debugging, but transcriptions are primary
            setCurrentAIMessage(text)
            // Note: Not adding to transcript here - transcriptions handle that
          },
          onAudioResponse: (audioData) => {
            playAudioResponse(audioData)
          },
          onTurnComplete: () => {
            console.log('[Interview] Turn complete - resetting to idle')
            // Turn is complete, reset audio playing state and orb mode
            isAudioPlayingRef.current = false
            updateOrbMode('idle')
            setCurrentAIMessage('')
            // Don't clear transcription here, keep it visible until next turn
            // setCurrentAITranscription('') 
            setCurrentUserTranscription('')
            isAITurnCompleteRef.current = true
          },
          onToolCall: (toolCall) => {
            // Check if AI called signal_interview_complete
            if (toolCall.functionCalls) {
              for (const fc of toolCall.functionCalls) {
                if (fc.name === 'signal_interview_complete') {
                  setAiSignaledCompletion(true)

                  // Calculate remaining audio duration
                  let delay = 5000 // Default fallback
                  if (playbackContextRef.current) {
                    const remainingTime = nextPlayTimeRef.current - playbackContextRef.current.currentTime
                    delay = Math.max(1000, remainingTime * 1000 + 1000) // Add 1s buffer
                  }

                  // Wait for audio to finish playing
                  setTimeout(() => {
                    endInterview()
                  }, delay)
                }
                else if (fc.name === 'save_answer_and_feedback') {
                  // AI is saving the answer + detailed feedback
                  const {
                    question_index,
                    user_response,
                    overall_score,
                    clarity_score,
                    structure_score,
                    relevance_score,
                    depth_score,
                    confidence_score,
                    overall_feedback,
                    strengths,
                    weaknesses,
                    suggestions,
                    tone_analysis
                  } = fc.args as {
                    question_index: number
                    user_response: string
                    overall_score: number
                    clarity_score: number
                    structure_score: number
                    relevance_score: number
                    depth_score: number
                    confidence_score: number
                    overall_feedback: string
                    strengths: string[]
                    weaknesses: string[]
                    suggestions: string[]
                    tone_analysis: string
                  }
                  console.log(`[Interview] AI saving answer for Q${question_index} with score ${overall_score}`)

                  // Call API to save with all fields
                  saveRichAnswer({
                    questionIndex: question_index,
                    userAnswer: user_response,
                    overallScore: overall_score,
                    clarityScore: clarity_score,
                    structureScore: structure_score,
                    relevanceScore: relevance_score,
                    depthScore: depth_score,
                    confidenceScore: confidence_score,
                    overallFeedback: overall_feedback,
                    strengths,
                    weaknesses,
                    suggestions,
                    toneAnalysis: tone_analysis
                  })
                }
              }
            }
          },
          onOutputTranscription: (text) => {
            // AI speech transcription - display this instead of text response

            if (isAITurnCompleteRef.current) {
              // New turn starting
              // Replace text
              setCurrentAITranscription(text)
              isAITurnCompleteRef.current = false
            } else {
              // Continuing current turn, append text
              setCurrentAITranscription(prev => prev + (prev ? ' ' : '') + text)
            }

            setOrbMode('ai')

            // Add to transcript using transcription
            // We use a simplified transcript for UI now, focusing on AI
            // The "full" transcript is less critical since we save rich answers via tool
          },
          onInputTranscription: (_text) => {
            // User speech transcription
            // We NO LONGER accumulate or save this manually
            // The AI hears it and aggregates it for the tool call
            setOrbMode('user')
          },
        }
      )

      // Connect
      await wsClient.connect()
      setClient(wsClient)
      clientRef.current = wsClient
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      setError(errorObj.message)
      setConnectionState('error')
      setInterviewState('idle')
      setOrbMode('idle')
      onError?.(errorObj)
    }
  }

  /**
   * Start audio recording
   */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      mediaStreamRef.current = stream

      // Create AudioContext for recording
      const audioContext = new AudioContext({ sampleRate: 16000 })

      const source = audioContext.createMediaStreamSource(stream)

      const processor = audioContext.createScriptProcessor(4096, 1, 1)

      let chunkCount = 0
      processor.onaudioprocess = (event) => {
        const currentClient = clientRef.current
        if (!currentClient) {
          if (chunkCount === 0) {
          }
          return
        }

        try {
          const inputData = event.inputBuffer.getChannelData(0)

          // Calculate audio level for voice activity detection
          let sum = 0
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i]
          }
          const rms = Math.sqrt(sum / inputData.length)
          const level = Math.min(1, rms * 10) // Normalize to 0-1
          setAudioLevel(level)

          // Voice activity detection - switch to user mode when speaking
          const VOICE_THRESHOLD = 0.02
          const currentOrbMode = orbModeRef.current

          // Log audio level periodically for debugging
          if (Math.random() < 0.01) { // Log ~1% of the time to avoid spam
            console.log('[Voice Detection] Audio level:', level.toFixed(3), 'Current orbMode:', currentOrbMode, 'Threshold:', VOICE_THRESHOLD)
          }

          if (level > VOICE_THRESHOLD) {
            // User is speaking - always switch to user mode
            if (currentOrbMode !== 'user') {
              console.log('[Voice Detection] User speaking detected! Level:', level.toFixed(3), 'Switching from', currentOrbMode, 'to user')
              updateOrbMode('user')
            }
          } else if (currentOrbMode === 'user') {
            // User stopped speaking - return to idle (unless AI is playing audio)
            if (!isAudioPlayingRef.current) {
              console.log('[Voice Detection] User stopped speaking, level:', level.toFixed(3))
              updateOrbMode('idle')
            }
          }

          // Convert to 16-bit PCM
          const pcm16 = new Int16Array(inputData.length)
          for (let i = 0; i < inputData.length; i++) {
            const clamped = Math.max(-1, Math.min(1, inputData[i]))
            pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
          }

          // Convert to base64
          const uint8Array = new Uint8Array(pcm16.buffer)
          let binaryString = ''
          for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i])
          }
          const base64Audio = btoa(binaryString)

          // Send to Gemini - continuous streaming
          currentClient.sendAudio(base64Audio)

          // Log first few chunks
          if (chunkCount < 3) {
          }
          chunkCount++
        } catch {
        }
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      audioContextRef.current = audioContext
      processorRef.current = processor

      setIsRecording(true)
    } catch (err) {
      setError(`Microphone access denied: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Stop recording - called when ending the interview
   */
  const stopRecording = () => {

    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    setIsRecording(false)
  }

  /**
   * Play audio response
   */
  const playAudioResponse = async (base64Audio: string) => {
    try {

      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext()
        nextPlayTimeRef.current = playbackContextRef.current.currentTime
      }

      const playbackContext = playbackContextRef.current

      if (playbackContext.state === 'suspended') {
        await playbackContext.resume()
      }

      // Decode base64 to PCM
      const binaryString = atob(base64Audio)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }


      // Convert to Int16Array
      const dataView = new DataView(bytes.buffer)
      const numSamples = Math.floor(bytes.length / 2)
      const pcm16 = new Int16Array(numSamples)

      for (let i = 0; i < numSamples; i++) {
        pcm16[i] = dataView.getInt16(i * 2, true)
      }

      // Convert to Float32Array
      const float32 = new Float32Array(pcm16.length)
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0
      }


      // Create audio buffer
      const sampleRate = 24000
      const audioBuffer = playbackContext.createBuffer(1, float32.length, sampleRate)
      audioBuffer.copyToChannel(float32, 0)


      // Schedule playback
      const currentTime = playbackContext.currentTime
      if (nextPlayTimeRef.current < currentTime) {
        nextPlayTimeRef.current = currentTime
      }

      const source = playbackContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(playbackContext.destination)

      // Calculate when this audio chunk will actually start playing
      const delayUntilStart = Math.max(0, (nextPlayTimeRef.current - currentTime) * 1000)

      // Set orb to AI mode when audio actually starts
      setTimeout(() => {
        isAudioPlayingRef.current = true
        updateOrbMode('ai')
        console.log('[Audio] AI audio started playing at scheduled time')
      }, delayUntilStart)

      source.start(nextPlayTimeRef.current)
      nextPlayTimeRef.current += audioBuffer.duration
    } catch (error) {
      console.error('[Audio] Playback error:', error)
      isAudioPlayingRef.current = false
    }
  }

  /**
   * Add turn to buffer
   */
  const _addTurn = async (speaker: 'ai' | 'user', content: string) => {
    const turn: BufferedTurn = {
      turn_number: turnCount + 1,
      speaker,
      content,
      timestamp: new Date().toISOString(),
    }

    const newBuffer = [...turnBuffer, turn]
    setTurnBuffer(newBuffer)
    setTurnCount(turnCount + 1)

    if (newBuffer.length >= FLUSH_THRESHOLD) {
      await flushTurns(newBuffer)
      setTurnBuffer([])
    }
  }

  /**
   * Save rich answer from AI tool call
   */
  const saveRichAnswer = async (data: {
    questionIndex: number
    userAnswer: string
    overallScore: number
    clarityScore: number
    structureScore: number
    relevanceScore: number
    depthScore: number
    confidenceScore: number
    overallFeedback: string
    strengths: string[]
    weaknesses: string[]
    suggestions: string[]
    toneAnalysis: string
  }) => {
    try {
      console.log(`[Interview] Saving rich answer for question ${data.questionIndex}...`)
      const response = await fetch('/api/interview/save-answer-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          ...data
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save rich answer')
      }

      console.log('[Interview] Rich answer saved successfully')
    } catch (error) {
      console.error('[Interview] Error saving rich answer:', error)
    }
  }

  /**
   * Flush turns (Optional now, mainly for transcript history if we want to save full chat log)
   */
  const flushTurns = async (turns: BufferedTurn[]) => {
    if (turns.length === 0) return

    try {
      await fetch('/api/interview/live-session/flush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, turns }),
      })
    } catch (error) {
      console.error('Flush error:', error)
    }
  }

  /**
   * End interview
   */
  const endInterview = async () => {
    try {
      setInterviewState('ending')
      stopRecording()

      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
        setClient(null)
      }

      // Complete session
      const response = await fetch('/api/interview/live-session/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          remainingTurns: turnBuffer,
          transcript,
        }),
      })

      if (playbackContextRef.current) {
        playbackContextRef.current.close()
        playbackContextRef.current = null
      }

      setConnectionState('disconnected')
      setOrbMode('idle')

      if (response.ok) {
        // Generate report
        setInterviewState('generating-report')
        setGeneratingReport(true)
        await generateReport()
        onComplete?.(transcript)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setInterviewState('idle')
    }
  }

  /**
   * Generate interview report
   */
  const generateReport = async () => {
    try {
      const response = await fetch('/api/interview/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate report')
      }

      const data = await response.json()
      setReportData(data.reportData)
      setGeneratingReport(false)
      setInterviewState('completed')
      setShowReportModal(true)
    } catch (err) {
      console.error('Error generating report:', err)
      setError('Failed to generate report. Please try again.')
      setGeneratingReport(false)
      setInterviewState('completed')
    }
  }

  /**
   * Handle retake interview
   */
  const handleRetake = async () => {
    try {
      setShowReportModal(false)
      setGeneratingReport(true)

      const response = await fetch('/api/interview/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        throw new Error('Failed to reset interview')
      }

      // Reset local state
      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
        setClient(null)
      }

      setTranscript([])
      setTurnBuffer([])
      setTurnCount(0)
      setReportData(null)
      setGeneratingReport(false)
      setError(null)
      setInterviewState('idle')
      setConnectionState('disconnected')
    } catch (err) {
      console.error('Error resetting interview:', err)
      setError('Failed to reset interview. Please refresh the page.')
      setGeneratingReport(false)
    }
  }

  // Cleanup on unmount
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording()
      if (clientRef.current) {

        clientRef.current.disconnect()
        clientRef.current = null
      }
      if (playbackContextRef.current) {
        playbackContextRef.current.close()
        playbackContextRef.current = null
      }
    }
  }, [])

  return (
    <div className="bg-background flex flex-col items-center">
      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-full mx-4"
          >
            <div className="bg-destructive/10 backdrop-blur-sm border border-destructive/50 rounded-xl p-4 flex items-start gap-3 shadow-lg">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Error</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setError(null)}
                className="flex-shrink-0 h-6 w-6 p-0"
              >
                ×
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full flex flex-col items-center">
        {/* AI Orb */}
        <div
          className="relative flex items-center justify-center shrink-0"
          style={{ width: '47.5vw', height: '47.5vw', maxWidth: '665px', maxHeight: '665px' }}
        >
          <AIOrb mode={orbMode} audioLevel={audioLevel} />
        </div>

        {/* AI Transcription (Speech) */}
        <AnimatePresence mode="wait">
          {currentAITranscription && interviewState === 'active' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl z-10"
            >
              <div className="bg-card/50 backdrop-blur-sm border border-primary/20 rounded-2xl p-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">AI is saying:</p>
                <p className="text-lg leading-relaxed">{currentAITranscription}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User Transcription (Speech) */}


        {/* Start/End Interview Button */}
        <div className="flex flex-col items-center gap-4 mt-6">
          {interviewState === 'idle' && (
            <Button
              onClick={startInterview}
              className="bg-primary text-primary-foreground font-bold h-14 px-10 text-lg rounded-xl shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:shadow-[0_0_35px_rgba(0,255,136,0.5)] hover:scale-105 transition-all duration-300"
            >
              Start Interview
            </Button>
          )}

          {interviewState === 'starting' && (
            <Button
              disabled
            >
              Starting...
            </Button>
          )}

          {interviewState === 'active' && (
            <Button
              variant="destructive"
              onClick={endInterview}
            >
              End Interview
            </Button>
          )}

          {interviewState === 'ending' && (
            <div className="text-center space-y-2">
              <Button
                disabled
                variant="destructive"
                className="px-12 py-6 text-lg rounded-full"
              >
                Ending...
              </Button>
              {aiSignaledCompletion && (
                <p className="text-sm text-gray-600">
                  Interview completed by AI. Generating your report...
                </p>
              )}
              {!aiSignaledCompletion && (
                <p className="text-sm text-gray-600">
                  Ending interview...
                </p>
              )}
            </div>
          )}

          {interviewState === 'generating-report' && (
            <Button
              disabled
              className="px-12 py-6 text-lg rounded-full"
            >
              Generating Report...
            </Button>
          )}

          {/* Status */}
          {interviewState === 'active' && transcript.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {Math.floor(transcript.length / 2)} questions answered
            </p>
          )}
        </div>
      </div>

      {/* Report Modal */}
      {reportData && (
        <InterviewReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportData={reportData}
          sessionId={sessionId}
          onRetake={handleRetake}
        />
      )}
    </div>
  )
}
