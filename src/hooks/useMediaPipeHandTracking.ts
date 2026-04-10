import { useEffect, useRef, useState, type RefObject } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { MEDIAPIPE_DETECTION_FPS } from '../utils/constants'
import type { HandTrackingFrame, NormalizedLandmark } from '../types/drawing'

export interface MediaPipeTrackingState {
  videoRef: RefObject<HTMLVideoElement | null>
  frame: HandTrackingFrame | null
  webcamReady: boolean
  mediaPipeReady: boolean
  error: string | null
}

/**
 * Isolated MediaPipe + webcam loop.
 *
 * FUTURE: mobile camera selection can be added here without touching drawing logic.
 */
export function useMediaPipeHandTracking(enabled: boolean): MediaPipeTrackingState {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [frame, setFrame] = useState<HandTrackingFrame | null>(null)
  const [webcamReady, setWebcamReady] = useState(false)
  const [mediaPipeReady, setMediaPipeReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setFrame(null)
      setWebcamReady(false)
      setMediaPipeReady(false)
      setError(null)
      return
    }
    let isMounted = true
    let raf = 0
    let stream: MediaStream | null = null
    let handLandmarker: HandLandmarker | null = null
    let lastDetect = 0

    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    const tick = () => {
      if (!isMounted || !handLandmarker || !videoRef.current) return
      const video = videoRef.current
      if (video.readyState < 2) {
        raf = requestAnimationFrame(tick)
        return
      }

      const now = performance.now()
      const minDelta = 1000 / MEDIAPIPE_DETECTION_FPS
      if (now - lastDetect >= minDelta) {
        lastDetect = now
        const result = handLandmarker.detectForVideo(video, now)
        const lms = result.landmarks[0] as NormalizedLandmark[] | undefined
        setFrame({
          timestampMs: now,
          landmarks: lms ?? null,
          hasHand: Boolean(lms && lms.length > 0),
          trackingLost: !lms,
        })
      }
      raf = requestAnimationFrame(tick)
    }

    const parseInitError = (err: unknown): string => {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('permission')) {
        return 'Camera permission denied. Allow camera access and reload.'
      }
      if (msg.toLowerCase().includes('secure context')) {
        return 'Camera requires https or localhost secure context.'
      }
      return `Unable to initialize MediaPipe: ${msg}`
    }

    const createLandmarkerWithFallback = async () => {
      const wasmRoots = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
        'https://unpkg.com/@mediapipe/tasks-vision/wasm',
      ]

      let lastErr: unknown = null
      for (const wasmRoot of wasmRoots) {
        try {
          const vision = await FilesetResolver.forVisionTasks(wasmRoot)
          const landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            },
            numHands: 1,
            runningMode: 'VIDEO',
          })
          return landmarker
        } catch (e) {
          lastErr = e
        }
      }
      throw lastErr ?? new Error('No MediaPipe wasm source succeeded.')
    }

    const start = async () => {
      try {
        setError(null)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
          audio: false,
        })
        if (!isMounted || !videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        if (!isMounted) return
        setWebcamReady(true)

        handLandmarker = await createLandmarkerWithFallback()
        if (!isMounted) return
        setMediaPipeReady(true)
        raf = requestAnimationFrame(tick)
      } catch (e) {
        setError(parseInitError(e))
      }
    }

    void start()

    return () => {
      isMounted = false
      stopLoop()
      handLandmarker?.close()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled])

  return {
    videoRef,
    frame,
    webcamReady,
    mediaPipeReady,
    error,
  }
}
