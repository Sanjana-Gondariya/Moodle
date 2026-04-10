import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { applyGestureInput } from '../utils/applyGestureInput'
import { classifyGesture, detectGesture } from '../utils/gestureDetection'
import {
  detectEraseModeGesture,
  INITIAL_ERASE_MODE_GESTURE_STATE,
} from '../utils/eraseModeGesture'
import {
  advanceOpenPalmClearHold,
  INITIAL_OPEN_PALM_CLEAR_HOLD_STATE,
} from '../utils/openPalmClearHold'
import { isOpenPalmClearCandidate } from '../utils/openPalmDetection'
import { handLandmarkToCanvasPoint } from '../utils/coordinateMapping'
import { createCursorSmoother } from '../utils/smoothing'
import {
  OPEN_PALM_CLEAR_HOLD_MS,
  OPEN_PALM_STABLE_FRAMES_BEFORE_HOLD,
} from '../utils/constants'
import type {
  DrawingEngine,
  GestureClearHoldStatus,
  GestureControllerStatus,
  GestureInputEvent,
  HandTrackingFrame,
  InputState,
  ToolMode,
} from '../types/drawing'

interface GestureControllerParams {
  frame: HandTrackingFrame | null
  canvas: HTMLCanvasElement | null
  engine: DrawingEngine
  /** When false, do not drive toolbar mode from the hand (avoids fighting the UI). */
  gestureEnabled: boolean
  setMode: Dispatch<SetStateAction<ToolMode>>
}

function emitGesture(engine: DrawingEngine, gesture: GestureInputEvent): void {
  applyGestureInput(engine, gesture)
}

function endStrokeSafely(
  engine: DrawingEngine,
  drawingActive: { current: boolean },
  strokeToolMode: { current: ToolMode | null },
): void {
  if (!drawingActive.current) return
  const m = strokeToolMode.current ?? 'draw'
  emitGesture(engine, { action: 'end', x: 0, y: 0, mode: m })
  drawingActive.current = false
  strokeToolMode.current = null
}

const IDLE_CLEAR_HOLD: GestureClearHoldStatus = {
  phase: 'idle',
  elapsedMs: 0,
  progress01: 0,
  secondsRemaining: Math.ceil(OPEN_PALM_CLEAR_HOLD_MS / 1000),
  message: 'Open palm hold: show open hand and keep it steady for 7s to clear.',
}

export function useGestureInputController({
  frame,
  canvas,
  engine,
  gestureEnabled,
  setMode,
}: GestureControllerParams): {
  status: GestureControllerStatus
  preview: InputState | null
} {
  const [status, setStatus] = useState<GestureControllerStatus>({
    handDetected: false,
    pinchActive: false,
    drawingActive: false,
    gestureToolMode: 'draw',
    gesture: 'idle',
    clearHold: IDLE_CLEAR_HOLD,
    trackingLost: false,
    inputMode: 'pointer',
    cursor: null,
  })
  const [preview, setPreview] = useState<InputState | null>(null)
  const smoothing = useMemo(() => createCursorSmoother(), [])
  const engineRef = useRef(engine)
  engineRef.current = engine
  const drawingActive = useRef(false)
  const pinchState = useRef({ active: false, onFrames: 0, offFrames: 0 })
  const eraseModeState = useRef(INITIAL_ERASE_MODE_GESTURE_STATE)
  const strokeToolMode = useRef<ToolMode | null>(null)
  const clearHoldState = useRef(INITIAL_OPEN_PALM_CLEAR_HOLD_STATE)

  useEffect(() => {
    if (!gestureEnabled) {
      endStrokeSafely(engineRef.current, drawingActive, strokeToolMode)
      setPreview(null)
      clearHoldState.current = INITIAL_OPEN_PALM_CLEAR_HOLD_STATE
      setStatus((s) => ({
        ...s,
        handDetected: false,
        drawingActive: false,
        gestureToolMode: 'draw',
        trackingLost: false,
        gesture: 'idle',
        pinchActive: false,
        clearHold: IDLE_CLEAR_HOLD,
        inputMode: 'pointer',
        cursor: null,
      }))
      smoothing.reset()
      pinchState.current = { active: false, onFrames: 0, offFrames: 0 }
      eraseModeState.current = INITIAL_ERASE_MODE_GESTURE_STATE
      return
    }

    const lostOrNoHand = !frame || !canvas || !frame.landmarks
    if (lostOrNoHand) {
      endStrokeSafely(engineRef.current, drawingActive, strokeToolMode)
      setPreview(null)
      clearHoldState.current = INITIAL_OPEN_PALM_CLEAR_HOLD_STATE
      setStatus((s) => ({
        ...s,
        handDetected: false,
        drawingActive: false,
        gestureToolMode: 'draw',
        trackingLost: Boolean(frame?.trackingLost),
        gesture: 'idle',
        pinchActive: false,
        clearHold: IDLE_CLEAR_HOLD,
        inputMode: 'pointer',
        cursor: null,
      }))
      smoothing.reset()
      pinchState.current = { active: false, onFrames: 0, offFrames: 0 }
      eraseModeState.current = INITIAL_ERASE_MODE_GESTURE_STATE
      return
    }

    if (frame.landmarks.length < 21) {
      endStrokeSafely(engineRef.current, drawingActive, strokeToolMode)
      setPreview(null)
      clearHoldState.current = INITIAL_OPEN_PALM_CLEAR_HOLD_STATE
      setStatus((s) => ({
        ...s,
        handDetected: false,
        drawingActive: false,
        gestureToolMode: 'draw',
        trackingLost: true,
        gesture: 'idle',
        pinchActive: false,
        clearHold: IDLE_CLEAR_HOLD,
        inputMode: 'gesture',
        cursor: null,
      }))
      smoothing.reset()
      pinchState.current = { active: false, onFrames: 0, offFrames: 0 }
      eraseModeState.current = INITIAL_ERASE_MODE_GESTURE_STATE
      return
    }

    const landmarks = frame.landmarks

    const { toolMode: gestureToolMode, next: nextErase } = detectEraseModeGesture(
      landmarks,
      eraseModeState.current,
    )
    eraseModeState.current = nextErase

    setMode((m) => (m === gestureToolMode ? m : gestureToolMode))

    const { pinchActive: pinchOn, nextPinch } = detectGesture(landmarks, pinchState.current)
    pinchState.current = nextPinch

    // End pinch stroke before open-palm clear logic so we never clear with an active stroke.
    if (!pinchOn) {
      endStrokeSafely(engineRef.current, drawingActive, strokeToolMode)
    }

    const openPalmCandidate = isOpenPalmClearCandidate(landmarks, {
      pinchActive: pinchOn,
      eraseModeActive: nextErase.eraseModeActive,
    })

    const holdAdvance = advanceOpenPalmClearHold(
      {
        nowMs: frame.timestampMs,
        openPalmCandidate,
        pinchActive: pinchOn,
        holdDurationMs: OPEN_PALM_CLEAR_HOLD_MS,
        stableFramesBeforeHold: OPEN_PALM_STABLE_FRAMES_BEFORE_HOLD,
      },
      clearHoldState.current,
    )
    clearHoldState.current = holdAdvance.next

    const clearHoldStatus: GestureClearHoldStatus = { ...holdAdvance.ui }

    if (holdAdvance.clearCanvas) {
      endStrokeSafely(engineRef.current, drawingActive, strokeToolMode)
      engineRef.current.clear()
    }

    const raw = handLandmarkToCanvasPoint(canvas, landmarks[8].x, landmarks[8].y)

    if (
      drawingActive.current &&
      strokeToolMode.current !== null &&
      gestureToolMode !== strokeToolMode.current
    ) {
      endStrokeSafely(engineRef.current, drawingActive, strokeToolMode)
    }

    if (pinchOn && !drawingActive.current) {
      smoothing.reset()
    }

    const smooth = smoothing.next(raw, frame.timestampMs)

    if (pinchOn) {
      if (!drawingActive.current) {
        strokeToolMode.current = gestureToolMode
        emitGesture(engineRef.current, {
          action: 'start',
          x: smooth.x,
          y: smooth.y,
          mode: gestureToolMode,
        })
        drawingActive.current = true
      } else {
        const m = strokeToolMode.current ?? gestureToolMode
        emitGesture(engineRef.current, { action: 'move', x: smooth.x, y: smooth.y, mode: m })
      }
    }

    const previewMode: ToolMode = pinchOn ? (strokeToolMode.current ?? gestureToolMode) : gestureToolMode

    const nextPreview: InputState = {
      x: smooth.x,
      y: smooth.y,
      isActive: pinchOn,
      mode: previewMode,
    }
    setPreview(nextPreview)

    const openPalmClearVisible =
      clearHoldStatus.phase === 'clear_gesture_detected' ||
      clearHoldStatus.phase === 'holding_to_clear'

    setStatus({
      handDetected: true,
      pinchActive: pinchOn,
      drawingActive: drawingActive.current,
      gestureToolMode,
      gesture: classifyGesture(pinchOn, nextErase.eraseModeActive, openPalmClearVisible),
      clearHold: clearHoldStatus,
      trackingLost: false,
      inputMode: 'gesture',
      cursor: { x: smooth.x, y: smooth.y },
    })
  }, [canvas, frame, gestureEnabled, setMode, smoothing])

  return { status, preview }
}
