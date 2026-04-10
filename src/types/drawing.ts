/**
 * All coordinates are **canvas CSS pixel space** (origin top-left of the canvas element).
 *
 * FUTURE: MediaPipe — map hand landmarks → video pixels → this space using the same helpers
 *         as `coordinateMapping.ts` (letterboxing / scale factors live in that layer).
 */

export type ToolMode = 'draw' | 'erase'

/** Lifecycle of a pointing or gesture-driven stroke. */
export type InputAction = 'start' | 'move' | 'end' | 'idle'

export interface Point {
  x: number
  y: number
  /** Monotonic time (e.g. performance.now()) — replay / sync / ML */
  t?: number
}

/**
 * Serializable stroke — source of truth for undo/redo, replay, multiplayer, ML export.
 * `size` is brush diameter in CSS pixels.
 */
export interface Stroke {
  id: string
  points: Point[]
  color: string
  size: number
  mode: ToolMode
}

/** Snapshot-friendly model for networking / ML pipelines. */
export interface DrawingDocument {
  strokes: Stroke[]
  version: number
}

/** Last-known pointer/gesture sample relative to the canvas (for UI / debug / future overlay). */
export interface InputState {
  x: number
  y: number
  isActive: boolean
  mode: ToolMode
}

/**
 * Normalized input packet — pointer, touch, and future MediaPipe adapters emit this shape.
 *
 * FUTURE: MediaPipe — set `action` from gesture classifier (pinch open = start, move = move, fist = end).
 * FUTURE: `mode` can be overridden per-frame when gestures switch tools (e.g. two-finger = erase).
 */
export interface GestureInputEvent {
  x: number
  y: number
  action: InputAction
  mode: ToolMode
}

export interface NormalizedLandmark {
  x: number
  y: number
  z: number
}

export type GestureName = 'pinch' | 'erase-pose' | 'two-fingers' | 'open-palm' | 'idle'

export interface HandTrackingFrame {
  timestampMs: number
  landmarks: NormalizedLandmark[] | null
  hasHand: boolean
  trackingLost: boolean
}

export type ClearHoldUiPhase =
  | 'idle'
  | 'clear_gesture_detected'
  | 'holding_to_clear'
  | 're_arm_required'

/** Open-palm → clear canvas hold progress (text-only UI). */
export interface GestureClearHoldStatus {
  phase: ClearHoldUiPhase
  elapsedMs: number
  progress01: number
  secondsRemaining: number
  message: string
}

export interface GestureControllerStatus {
  handDetected: boolean
  pinchActive: boolean
  /** True while a stroke is in progress (pinch held after startStroke). */
  drawingActive: boolean
  /** Debounced tool mode from index+middle proximity (draw vs erase). */
  gestureToolMode: ToolMode
  gesture: GestureName
  clearHold: GestureClearHoldStatus
  trackingLost: boolean
  inputMode: 'gesture' | 'pointer'
  cursor: Point | null
}

/**
 * Imperative drawing API. Input layer calls only these methods with canvas-space coordinates.
 */
export interface DrawingEngine {
  /** Optional `mode` overrides synced tool mode for this stroke (e.g. gesture path). */
  startStroke(x: number, y: number, mode?: ToolMode): void
  continueStroke(x: number, y: number): void
  endStroke(): void
  undo(): void
  redo(): void
  clear(): void
}
