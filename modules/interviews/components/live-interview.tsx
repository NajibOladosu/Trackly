'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/shared/ui/button'
import { AIOrb, type OrbMode } from './ai-orb'
import { Mic, MicOff, Square, AlertCircle } from 'lucide-react'
import { GeminiLiveClient } from '@/lib/gemini-live/client'
import type { ConnectionState, BufferedTurn } from '@/lib/gemini-live/types'
import type { ConversationTurn } from '@/types/database'
import { motion, AnimatePresence } from 'framer-motion'

interface LiveInterviewProps {
  sessionId: string
  onComplete?: (transcript: ConversationTurn[]) => void
  onError?: (error: Error) => void
}

export function LiveInterview({ sessionId, onComplete, onError }: LiveInterviewProps) {
  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [client, setClient] = useState<GeminiLiveClient | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [_micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt')

  // Transcript state
  const [transcript, setTranscript] = useState<ConversationTurn[]>([])
  const [currentAIMessage, setCurrentAIMessage] = useState<string>('')

  // Turn buffering
  const [turnBuffer, setTurnBuffer] = useState<BufferedTurn[]>([])
  const [turnCount, setTurnCount] = useState(0)
  const FLUSH_THRESHOLD = 8

  // Audio refs
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)

  // Playback queue refs
  const playbackContextRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef<number>(0)

  // AI Orb state
  const [orbState, setOrbState] = useState<OrbMode>('idle')

  /**
   * Initialize live session
   */
  const initializeSession = async () => {
    try {
      setConnectionState('connecting')
      setError(null)
      setOrbState('idle')

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

      const { token, systemInstruction, model } = await response.json()

      // Create WebSocket client
      const wsClient = new GeminiLiveClient(
        { token, systemInstruction, model },
        {
          onConnected: () => {
            setConnectionState('connected')
          },
          onDisconnected: () => {
            setConnectionState('disconnected')
            setOrbState('idle')
            stopRecording()
          },
          onError: (error) => {
            setError(error.message)
            setConnectionState('error')
            setOrbState('idle')
            onError?.(error)
          },
          onSetupComplete: () => {
            // AI is ready, start recording
            startRecording()
          },
          onTextResponse: (text) => {
            setCurrentAIMessage(text)
            setOrbState('ai')

            // Add to transcript
            const turn: ConversationTurn = {
              id: `${Date.now()}-ai`,
              session_id: sessionId,
              user_id: '',
              turn_number: turnCount + 1,
              speaker: 'ai',
              content: text,
              audio_url: null,
              audio_duration_seconds: null,
              timestamp: new Date().toISOString(),
              metadata: null,
              created_at: new Date().toISOString(),
            }
            setTranscript((prev) => [...prev, turn])

            // Buffer turn
            addTurn('ai', text)
          },
          onAudioResponse: (audioData) => {
            playAudioResponse(audioData)
          },
          onTurnComplete: () => {
            setOrbState('user')
            setCurrentAIMessage('')
          },
        }
      )

      // Connect
      await wsClient.connect()
      setClient(wsClient)
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      setError(errorObj.message)
      setConnectionState('error')
      setOrbState('idle')
      onError?.(errorObj)
    }
  }

  /**
   * Start audio recording
   */
  const startRecording = async () => {
    try {
      // Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      mediaStreamRef.current = stream
      setMicPermission('granted')

      // Create AudioContext for recording
      const audioContext = new AudioContext({ sampleRate: 16000 })
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (event) => {
        if (!client || connectionState !== 'connected' || isMuted) return

        try {
          // Get audio data
          const inputData = event.inputBuffer.getChannelData(0)

          // Convert Float32 to 16-bit PCM
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

          // Send to Gemini
          client.sendAudio(base64Audio)
        } catch (error) {
          console.error('Audio processing error:', error)
        }
      }

      // Connect pipeline
      source.connect(processor)
      processor.connect(audioContext.destination)

      audioContextRef.current = audioContext
      processorRef.current = processor

      setIsRecording(true)
      setOrbState('user')
    } catch (err) {
      setMicPermission('denied')
      setError(`Microphone access denied: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Stop audio recording and send turn complete
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
    setOrbState('ai')

    // Signal turn completion
    if (client && connectionState === 'connected') {
      client.sendText('')
    }
  }

  /**
   * Play audio response with queue
   */
  const playAudioResponse = async (base64Audio: string) => {
    try {
      // Create playback context once
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext()
        nextPlayTimeRef.current = playbackContextRef.current.currentTime
      }

      const playbackContext = playbackContextRef.current

      // Ensure context is running
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
      source.start(nextPlayTimeRef.current)

      nextPlayTimeRef.current += audioBuffer.duration
    } catch (error) {
      console.error('Audio playback error:', error)
    }
  }

  /**
   * Add turn to buffer and flush if needed
   */
  const addTurn = async (speaker: 'ai' | 'user', content: string) => {
    const turn: BufferedTurn = {
      turn_number: turnCount + 1,
      speaker,
      content,
      timestamp: new Date().toISOString(),
    }

    const newBuffer = [...turnBuffer, turn]
    setTurnBuffer(newBuffer)
    setTurnCount(turnCount + 1)

    // Flush if threshold reached
    if (newBuffer.length >= FLUSH_THRESHOLD) {
      await flushTurns(newBuffer)
      setTurnBuffer([])
    }
  }

  /**
   * Flush buffered turns to database
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
      // Stop recording
      stopRecording()

      // Disconnect client
      if (client) {
        client.disconnect()
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

      if (response.ok) {
        onComplete?.(transcript)
      }

      // Cleanup
      if (playbackContextRef.current) {
        playbackContextRef.current.close()
        playbackContextRef.current = null
      }

      setConnectionState('disconnected')
      setOrbState('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * Toggle mute
   */
  const toggleMute = () => {
    setIsMuted(!isMuted)
  }

  // Initialize on mount
  useEffect(() => {
    initializeSession()

    return () => {
      // Cleanup on unmount
      stopRecording()
      if (client) {
        client.disconnect()
      }
      if (playbackContextRef.current) {
        playbackContextRef.current.close()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Error Display */}
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
                <p className="text-sm font-semibold text-foreground">Connection Error</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{error}</p>
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

      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${
                  connectionState === 'connected' ? 'bg-primary animate-pulse' :
                  connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                  connectionState === 'error' ? 'bg-destructive' :
                  'bg-muted-foreground'
                }`} />
                <div>
                  <p className="text-sm font-semibold">
                    {connectionState === 'connected' ? 'Live Interview' :
                     connectionState === 'connecting' ? 'Connecting...' :
                     connectionState === 'error' ? 'Connection Failed' :
                     'Initializing'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {transcript.length > 0
                      ? `${Math.floor(transcript.length / 2)} questions answered`
                      : 'Preparing your interview'}
                  </p>
                </div>
              </div>
            </div>

            {connectionState === 'connected' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={endInterview}
                className="gap-2"
              >
                <Square className="w-4 h-4" />
                End Interview
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Interview Area - Left Side */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="max-w-3xl w-full space-y-8">
            {/* AI Orb */}
            <div className="flex justify-center">
              <AIOrb mode={orbState} />
            </div>

            {/* Current AI Message */}
            <AnimatePresence mode="wait">
              {currentAIMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="w-full"
                >
                  <div className="relative">
                    <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-primary/5 rounded-2xl blur-xl" />
                    <div className="relative bg-card/80 backdrop-blur-sm border border-primary/20 rounded-2xl p-8">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-lg">🤖</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-primary mb-2">AI Interviewer</p>
                          <p className="text-base leading-relaxed">{currentAIMessage}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Controls */}
            <div className="flex justify-center">
              {connectionState === 'connected' && (
                <div className="flex items-center gap-4">
                  <Button
                    size="lg"
                    variant={isMuted ? 'outline' : 'default'}
                    onClick={toggleMute}
                    disabled={!isRecording}
                    className="gap-2 min-w-[140px]"
                  >
                    {isMuted ? (
                      <>
                        <MicOff className="w-5 h-5" />
                        Unmute
                      </>
                    ) : (
                      <>
                        <Mic className="w-5 h-5" />
                        {isRecording ? 'Recording' : 'Mic Ready'}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {connectionState === 'connecting' && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                  <span className="text-sm">Connecting to AI interviewer...</span>
                </div>
              )}

              {connectionState === 'error' && (
                <Button onClick={initializeSession} className="gap-2">
                  Retry Connection
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Transcript Sidebar - Right Side */}
        {transcript.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-96 border-l border-border/50 bg-card/30 backdrop-blur-sm flex flex-col"
          >
            {/* Transcript Header */}
            <div className="px-6 py-4 border-b border-border/50">
              <h3 className="font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Live Transcript
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Real-time conversation log
              </p>
            </div>

            {/* Transcript Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {transcript.map((turn, index) => (
                <motion.div
                  key={turn.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.05, 0.3) }}
                  className={`flex ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 ${
                      turn.speaker === 'user'
                        ? 'bg-primary/10 border border-primary/20'
                        : 'bg-muted/50 border border-border/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        turn.speaker === 'user'
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {turn.speaker === 'user' ? '👤' : '🤖'}
                      </div>
                      <span className={`text-xs font-semibold ${
                        turn.speaker === 'user' ? 'text-primary' : 'text-muted-foreground'
                      }`}>
                        {turn.speaker === 'user' ? 'You' : 'AI'}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{turn.content}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Transcript Footer */}
            {turnBuffer.length > 0 && (
              <div className="px-6 py-3 border-t border-border/50 bg-muted/20">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span>Syncing {turnBuffer.length} of {FLUSH_THRESHOLD} turns...</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
