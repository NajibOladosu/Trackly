'use client'

import { useState, useRef } from 'react'
import { notFound } from 'next/navigation'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Badge } from '@/shared/ui/badge'
import { GeminiLiveClient } from '@/lib/gemini-live/client'
import type { ConnectionState, ContentPart } from '@/lib/gemini-live/types'

interface TestTurn {
  turn_number: number
  speaker: 'ai' | 'user'
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}

export default function TestLivePage() {
  // Debug-only page: hide entirely outside development to avoid exposing
  // the Live API token-fetch surface in production.
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [messages, setMessages] = useState<string[]>([])
  const [client, setClient] = useState<GeminiLiveClient | null>(null)
  const [sessionId, setSessionId] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt')

  // Turn buffering state
  const [turnBuffer, setTurnBuffer] = useState<TestTurn[]>([])
  const [turnCount, setTurnCount] = useState(0)
  const FLUSH_THRESHOLD = 8 // Flush every 8 turns

  const mediaRecorderRef = useRef<ScriptProcessorNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Audio playback queue
  const playbackContextRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef<number>(0)
  const audioQueueRef = useRef<AudioBuffer[]>([])

  const addMessage = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setMessages((prev) => [...prev, `[${timestamp}] ${message}`])
    console.log(`[${timestamp}] ${message}`)
  }

  // Add turn to buffer and flush if threshold reached
  const addTurn = async (speaker: 'ai' | 'user', content: string, metadata?: Record<string, unknown>) => {
    const turn = {
      turn_number: turnCount + 1,
      speaker,
      content,
      timestamp: new Date().toISOString(),
      metadata,
    }

    const newBuffer = [...turnBuffer, turn]
    setTurnBuffer(newBuffer)
    setTurnCount(turnCount + 1)

    addMessage(`📝 Turn ${turnCount + 1} (${speaker}): ${content.substring(0, 50)}...`)

    // Flush if threshold reached
    if (newBuffer.length >= FLUSH_THRESHOLD) {
      await flushTurns(newBuffer)
      setTurnBuffer([])
    }
  }

  // Flush buffered turns to database
  const flushTurns = async (turns: TestTurn[]) => {
    if (!sessionId || turns.length === 0) return

    try {
      addMessage(`💾 Flushing ${turns.length} turns to database...`)

      const response = await fetch('/api/interview/live-session/flush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, turns }),
      })

      if (!response.ok) {
        throw new Error('Flush failed')
      }

      const result = await response.json()
      addMessage(`✅ Flushed ${result.saved} turns successfully`)
    } catch (error) {
      addMessage(`❌ Flush error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const requestMicrophoneAccess = async () => {
    try {
      addMessage('🎤 Requesting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      streamRef.current = stream
      setMicPermission('granted')
      addMessage('✅ Microphone access granted')
      return stream
    } catch (error) {
      setMicPermission('denied')
      addMessage(`❌ Microphone access denied: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  const handleConnect = async () => {
    if (!sessionId) {
      addMessage('❌ Error: Please enter a session ID')
      return
    }

    try {
      // Reset audio playback for new session
      resetAudioPlayback()

      addMessage('🔄 Initializing live session...')
      setConnectionState('connecting')

      // Call init endpoint to get token and config
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
      addMessage(`✅ Token received for model: ${model}`)

      // Create WebSocket client
      const wsClient = new GeminiLiveClient(
        { token, systemInstruction, model },
        {
          onConnected: () => {
            addMessage('✅ WebSocket connected')
            setConnectionState('connected')
          },
          onDisconnected: () => {
            addMessage('⚠️ WebSocket disconnected')
            setConnectionState('disconnected')
            stopRecording()
          },
          onError: (error) => {
            addMessage(`❌ Error: ${error.message}`)
            setConnectionState('error')
          },
          onSetupComplete: () => {
            addMessage('✅ Setup complete - ready for audio')
          },
          onContent: (content) => {
            console.log('Server content received:', content)
            if (content.modelTurn?.parts) {
              console.log('Parts:', content.modelTurn.parts)

              // Handle text response
              const textPart = content.modelTurn.parts.find((p: ContentPart) => 'text' in p)
              if (textPart && 'text' in textPart) {
                addMessage(`💬 AI: ${textPart.text.substring(0, 100)}...`)

                // Add AI turn to buffer
                addTurn('ai', textPart.text, { type: 'ai_response' })
              }

              // Handle audio response
              const audioPart = content.modelTurn.parts.find((p: ContentPart) => 'inlineData' in p)
              console.log('Audio part found:', audioPart)
              if (audioPart && 'inlineData' in audioPart && audioPart.inlineData?.data) {
                addMessage(`🔊 Playing AI audio response...`)
                playAudioResponse(audioPart.inlineData.data)
              }
            }
          },
          onAudioResponse: (audioData) => {
            console.log('onAudioResponse called with data length:', audioData.length)
            addMessage(`🔊 AI audio response received (${audioData.length} chars)`)
            playAudioResponse(audioData)
          },
          onToolCall: (toolCall) => {
            const calls = toolCall.functionCalls?.map(fc => fc.name).join(', ') || 'unknown'
            addMessage(`🔧 Tool call: ${calls}`)
          },
        }
      )

      // Connect to Gemini Live API
      addMessage('🔄 Connecting to Gemini Live API...')
      await wsClient.connect()
      setClient(wsClient)
    } catch (error) {
      addMessage(`❌ Connection failed: ${error instanceof Error ? error.message : String(error)}`)
      setConnectionState('error')
    }
  }

  const handleDisconnect = () => {
    if (client) {
      addMessage('🔄 Disconnecting...')
      stopRecording()
      resetAudioPlayback()
      client.disconnect()
      setClient(null)
      setConnectionState('disconnected')
    }
  }

  const startRecording = async () => {
    if (!client || connectionState !== 'connected') {
      addMessage('❌ Not connected - cannot start recording')
      return
    }

    try {
      // Request microphone if not already granted
      let stream = streamRef.current
      if (!stream) {
        stream = await requestMicrophoneAccess()
      }

      addMessage('🎙️ Starting audio recording...')

      // Create AudioContext for direct audio processing
      const audioContext = new AudioContext({ sampleRate: 16000 })
      const source = audioContext.createMediaStreamSource(stream)

      // Create ScriptProcessor for real-time audio capture
      const processor = audioContext.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (event) => {
        if (!client || connectionState !== 'connected') return

        try {
          // Get audio data (already mono at 16kHz due to AudioContext config)
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

          // Log every 10th chunk to avoid spam
          if (Math.random() < 0.1) {
            addMessage(`📤 Streaming audio (${pcm16.length} samples)`)
          }
        } catch (error) {
          console.error('Audio processing error:', error)
        }
      }

      // Connect the audio pipeline
      source.connect(processor)
      processor.connect(audioContext.destination)

      // Store references for cleanup
      audioContextRef.current = audioContext
      mediaRecorderRef.current = processor // Store processor in mediaRecorderRef

      setIsRecording(true)
      addMessage('✅ Recording started - speak now!')
    } catch (error) {
      addMessage(`❌ Recording failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Disconnect and cleanup ScriptProcessor
      const processor = mediaRecorderRef.current
      if (processor.disconnect) {
        processor.disconnect()
      }

      // Close AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }

      mediaRecorderRef.current = null
      setIsRecording(false)
      addMessage('⏹️ Recording stopped')

      // Signal turn completion to Gemini
      if (client) {
        client.sendText('') // Empty text with turnComplete triggers AI response
        addMessage('✅ Turn complete signal sent')
      }
    }
  }

  const playAudioResponse = async (base64Audio: string) => {
    try {
      // Create playback context once and reuse it
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext()
        nextPlayTimeRef.current = playbackContextRef.current.currentTime
      }

      const playbackContext = playbackContextRef.current

      // Ensure context is running
      if (playbackContext.state === 'suspended') {
        await playbackContext.resume()
      }

      // Decode base64 to raw bytes
      const binaryString = atob(base64Audio)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Convert bytes to Int16Array (little-endian 16-bit PCM)
      const dataView = new DataView(bytes.buffer)
      const numSamples = Math.floor(bytes.length / 2)
      const pcm16 = new Int16Array(numSamples)

      for (let i = 0; i < numSamples; i++) {
        pcm16[i] = dataView.getInt16(i * 2, true) // true = little-endian
      }

      // Convert 16-bit PCM to Float32Array (normalized to -1.0 to 1.0)
      const float32 = new Float32Array(pcm16.length)
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0
      }

      // Gemini uses 24kHz sample rate for native audio output
      const sampleRate = 24000
      const audioBuffer = playbackContext.createBuffer(1, float32.length, sampleRate)
      audioBuffer.copyToChannel(float32, 0)

      // Schedule this chunk to play after previous chunks
      const currentTime = playbackContext.currentTime

      // If nextPlayTime is in the past, start immediately
      if (nextPlayTimeRef.current < currentTime) {
        nextPlayTimeRef.current = currentTime
      }

      const source = playbackContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(playbackContext.destination)

      // Start at scheduled time
      source.start(nextPlayTimeRef.current)

      // Log first chunk
      if (audioQueueRef.current.length === 0) {
        addMessage(`🔊 Started streaming AI audio at ${sampleRate}Hz`)
      }

      // Update next play time
      nextPlayTimeRef.current += audioBuffer.duration

      // Track queued buffers
      audioQueueRef.current.push(audioBuffer)

      // Log progress every 10 chunks
      if (audioQueueRef.current.length % 10 === 0) {
        const totalDuration = audioQueueRef.current.reduce((sum, buf) => sum + buf.duration, 0)
        console.log(`Queued ${audioQueueRef.current.length} chunks, total: ${totalDuration.toFixed(1)}s`)
      }
    } catch (error) {
      console.error('Audio playback error:', error)
      addMessage(`❌ Audio playback error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Reset audio playback queue (call when starting new conversation)
  const resetAudioPlayback = () => {
    if (playbackContextRef.current) {
      playbackContextRef.current.close()
      playbackContextRef.current = null
    }
    nextPlayTimeRef.current = 0
    audioQueueRef.current = []
    addMessage('🔄 Audio playback reset')
  }

  const handleSendTest = () => {
    if (!client) {
      addMessage('❌ Not connected')
      return
    }

    const testMessage = 'Hello, this is a test message'
    addMessage('📤 Sending test text message...')
    client.sendText(testMessage)

    // Add user turn to buffer
    addTurn('user', testMessage, { type: 'test_message' })
  }

  const getStateColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
        return 'bg-yellow-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getMicColor = () => {
    switch (micPermission) {
      case 'granted':
        return 'bg-green-500'
      case 'denied':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 flex-wrap">
            Gemini Live API - Audio Test
            <Badge className={getStateColor()}>{connectionState}</Badge>
            <Badge className={getMicColor()}>
              Mic: {micPermission === 'granted' ? '✓' : micPermission}
            </Badge>
            <Badge variant="outline">
              Turns: {turnCount} | Buffer: {turnBuffer.length}/{FLUSH_THRESHOLD}
            </Badge>
          </CardTitle>
          <CardDescription>
            Test real-time audio streaming with Gemini Live API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Session ID Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Interview Session ID</label>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Enter session ID to test"
              className="w-full p-2 border rounded"
              disabled={connectionState === 'connected'}
            />
          </div>

          {/* Connection Controls */}
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleConnect}
              disabled={connectionState !== 'disconnected' || !sessionId}
            >
              Connect
            </Button>
            <Button
              onClick={handleDisconnect}
              disabled={connectionState === 'disconnected'}
              variant="outline"
            >
              Disconnect
            </Button>
            <Button
              onClick={handleSendTest}
              disabled={connectionState !== 'connected'}
              variant="secondary"
            >
              Send Test Message
            </Button>
            <Button
              onClick={() => flushTurns(turnBuffer)}
              disabled={turnBuffer.length === 0}
              variant="outline"
            >
              Flush Buffer ({turnBuffer.length})
            </Button>
          </div>

          {/* Audio Controls */}
          <div className="flex gap-2 flex-wrap border-t pt-4">
            <Button
              onClick={requestMicrophoneAccess}
              disabled={micPermission === 'granted'}
              variant="outline"
            >
              Request Microphone
            </Button>
            <Button
              onClick={startRecording}
              disabled={connectionState !== 'connected' || isRecording || micPermission !== 'granted'}
              className="bg-red-600 hover:bg-red-700"
            >
              🎙️ Start Recording
            </Button>
            <Button
              onClick={stopRecording}
              disabled={!isRecording}
              variant="outline"
            >
              ⏹️ Stop Recording
            </Button>
          </div>

          {/* Message Log */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Activity Log</label>
            <div className="border rounded p-4 h-96 overflow-y-auto bg-gray-50 dark:bg-gray-900 font-mono text-sm">
              {messages.length === 0 ? (
                <p className="text-gray-500">No messages yet. Click Connect to start.</p>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className="mb-1">
                    {msg}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4 space-y-2">
            <h3 className="font-semibold text-sm">Phase 2: Audio Testing Instructions</h3>
            <ol className="text-sm space-y-1 list-decimal list-inside">
              <li>Create an interview session and copy the session ID</li>
              <li>Paste session ID and click &quot;Connect&quot;</li>
              <li>Click &quot;Request Microphone&quot; to grant microphone access</li>
              <li>Click &quot;Start Recording&quot; and speak a question or message</li>
              <li>Watch the log for audio chunks being sent</li>
              <li>AI will respond with both text and audio</li>
              <li>Audio response will auto-play</li>
              <li>Click &quot;Stop Recording&quot; when done</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
