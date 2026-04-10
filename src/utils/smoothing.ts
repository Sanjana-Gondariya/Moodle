import type { Point } from '../types/drawing'
import {
  CURSOR_SMOOTHING_MAX_ALPHA,
  CURSOR_SMOOTHING_MIN_ALPHA,
  CURSOR_SMOOTHING_SPEED_FOR_MAX,
} from './constants'

export interface Smoother {
  reset(): void
  next(point: Point, nowMs: number): Point
}

/** Adaptive exponential smoother: low lag on fast movement, more damping on jitter. */
export function createCursorSmoother(
  minAlpha = CURSOR_SMOOTHING_MIN_ALPHA,
  maxAlpha = CURSOR_SMOOTHING_MAX_ALPHA,
  speedForMax = CURSOR_SMOOTHING_SPEED_FOR_MAX,
): Smoother {
  let prev: Point | null = null
  let prevTs = 0

  return {
    reset() {
      prev = null
      prevTs = 0
    },
    next(point: Point, nowMs: number) {
      if (!prev) {
        prev = point
        prevTs = nowMs
        return point
      }

      const dt = Math.max(1, nowMs - prevTs)
      const dx = point.x - prev.x
      const dy = point.y - prev.y
      const speed = Math.sqrt(dx * dx + dy * dy) / dt
      const t = Math.min(1, speed / speedForMax)
      const alpha = minAlpha + (maxAlpha - minAlpha) * t

      const smoothed = {
        x: prev.x + alpha * dx,
        y: prev.y + alpha * dy,
      }
      prev = smoothed
      prevTs = nowMs
      return smoothed
    },
  }
}
