import type { NormalizedLandmark, ToolMode } from '../types/drawing'
import {
  ERASE_FINGERS_CLOSE_THRESHOLD,
  ERASE_FINGERS_OPEN_THRESHOLD,
  ERASE_MODE_OFF_FRAMES,
  ERASE_MODE_ON_FRAMES,
} from './constants'

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** Internal debounce state for index–middle “together” → erase tool mode. */
export interface EraseModeGestureState {
  eraseModeActive: boolean
  onFrames: number
  offFrames: number
}

export const INITIAL_ERASE_MODE_GESTURE_STATE: EraseModeGestureState = {
  eraseModeActive: false,
  onFrames: 0,
  offFrames: 0,
}

/**
 * Index fingertip (8) vs middle fingertip (12), normalized by palm size (wrist → middle MCP).
 * When the ratio is **small**, tips are **close** → erase mode. When **large**, tips are apart → draw mode.
 * Uses Schmitt thresholds + frame counts (same pattern as pinch) to avoid flicker.
 */
export function detectEraseModeGesture(
  landmarks: NormalizedLandmark[],
  prev: EraseModeGestureState,
): { toolMode: ToolMode; next: EraseModeGestureState } {
  const indexTip = landmarks[8]
  const middleTip = landmarks[12]
  const wrist = landmarks[0]
  const middleMcp = landmarks[9]
  const palmSize = Math.max(0.001, dist(wrist, middleMcp))
  const fingerSpreadRatio = dist(indexTip, middleTip) / palmSize

  let next: EraseModeGestureState = { ...prev }

  if (!prev.eraseModeActive) {
    if (fingerSpreadRatio < ERASE_FINGERS_CLOSE_THRESHOLD) {
      next.onFrames += 1
      if (next.onFrames >= ERASE_MODE_ON_FRAMES) {
        next.eraseModeActive = true
        next.onFrames = 0
      }
    } else {
      next.onFrames = 0
    }
  } else {
    if (fingerSpreadRatio > ERASE_FINGERS_OPEN_THRESHOLD) {
      next.offFrames += 1
      if (next.offFrames >= ERASE_MODE_OFF_FRAMES) {
        next.eraseModeActive = false
        next.offFrames = 0
      }
    } else {
      next.offFrames = 0
    }
  }

  return {
    toolMode: next.eraseModeActive ? 'erase' : 'draw',
    next,
  }
}
