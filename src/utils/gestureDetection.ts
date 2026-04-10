import type { GestureName, NormalizedLandmark } from '../types/drawing'
import {
  PINCH_END_FRAMES,
  PINCH_END_THRESHOLD,
  PINCH_START_FRAMES,
  PINCH_START_THRESHOLD,
} from './constants'

interface PinchState {
  active: boolean
  onFrames: number
  offFrames: number
}

export function classifyGesture(
  pinchActive: boolean,
  eraseModeActive: boolean,
  openPalmClearVisible: boolean,
): GestureName {
  if (pinchActive) return 'pinch'
  if (eraseModeActive) return 'erase-pose'
  if (openPalmClearVisible) return 'open-palm'
  return 'idle'
}

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function detectGesture(
  landmarks: NormalizedLandmark[],
  prev: PinchState,
): { pinchActive: boolean; nextPinch: PinchState } {
  const thumbTip = landmarks[4]
  const indexTip = landmarks[8]
  const wrist = landmarks[0]
  const middleMcp = landmarks[9]
  const palmSize = Math.max(0.001, dist(wrist, middleMcp))
  const pinchRatio = dist(thumbTip, indexTip) / palmSize

  let next = { ...prev }
  if (!prev.active) {
    if (pinchRatio < PINCH_START_THRESHOLD) {
      next.onFrames += 1
      if (next.onFrames >= PINCH_START_FRAMES) {
        next.active = true
        next.onFrames = 0
      }
    } else {
      next.onFrames = 0
    }
  } else {
    if (pinchRatio > PINCH_END_THRESHOLD) {
      next.offFrames += 1
      if (next.offFrames >= PINCH_END_FRAMES) {
        next.active = false
        next.offFrames = 0
      }
    } else {
      next.offFrames = 0
    }
  }

  return {
    pinchActive: next.active,
    nextPinch: next,
  }
}
