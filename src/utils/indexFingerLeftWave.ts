/**
 * Deliberate leftward swipe of index fingertip (landmark 8) in canvas CSS px.
 * Left on screen means decreasing x: oldest.x - newest.x must exceed the threshold.
 */

import {
  UNDO_LEFT_COOLDOWN_MS,
  UNDO_LEFT_MAX_SAMPLES,
  UNDO_LEFT_MAX_VERTICAL_PX,
  UNDO_LEFT_MIN_HORIZONTAL_FRAC,
  UNDO_LEFT_MIN_HORIZONTAL_PX,
  UNDO_LEFT_MIN_HORIZ_DOMINANCE,
  UNDO_LEFT_MIN_SPAN_MS,
  UNDO_LEFT_WAVE_WINDOW_MS,
} from './constants'

export interface FingerTrailSample {
  t: number
  x: number
  y: number
}

export interface IndexFingerLeftWaveState {
  samples: FingerTrailSample[]
  cooldownUntilMs: number
}

export const INITIAL_INDEX_FINGER_LEFT_WAVE_STATE: IndexFingerLeftWaveState = {
  samples: [],
  cooldownUntilMs: 0,
}

export interface AdvanceIndexFingerLeftWaveInput {
  nowMs: number
  x: number
  y: number
  canvasWidth: number
  canvasHeight: number
  recordSample: boolean
}

export interface IndexFingerLeftWaveResult {
  next: IndexFingerLeftWaveState
  shouldUndo: boolean
  statusMessage: string
}

function minHorizontalPx(canvasWidth: number): number {
  return Math.max(UNDO_LEFT_MIN_HORIZONTAL_PX, canvasWidth * UNDO_LEFT_MIN_HORIZONTAL_FRAC)
}

function pruneWindow(samples: FingerTrailSample[], nowMs: number, windowMs: number): FingerTrailSample[] {
  const cutoff = nowMs - windowMs
  return samples.filter((s) => s.t >= cutoff)
}

export function advanceIndexFingerLeftWave(
  input: AdvanceIndexFingerLeftWaveInput,
  prev: IndexFingerLeftWaveState,
): IndexFingerLeftWaveResult {
  const { nowMs, x, y, canvasWidth, canvasHeight, recordSample } = input

  if (nowMs < prev.cooldownUntilMs) {
    const msLeft = Math.ceil(prev.cooldownUntilMs - nowMs)
    return {
      next: { samples: [], cooldownUntilMs: prev.cooldownUntilMs },
      shouldUndo: false,
      statusMessage: 'Undo wave: cooldown (' + msLeft + 'ms)',
    }
  }

  if (!recordSample) {
    return {
      next: { samples: [], cooldownUntilMs: prev.cooldownUntilMs },
      shouldUndo: false,
      statusMessage: 'Undo wave: idle (paused during pinch or clear hold)',
    }
  }

  let samples = pruneWindow(prev.samples, nowMs, UNDO_LEFT_WAVE_WINDOW_MS)
  samples.push({ t: nowMs, x, y })
  if (samples.length > UNDO_LEFT_MAX_SAMPLES) {
    samples = samples.slice(-UNDO_LEFT_MAX_SAMPLES)
  }

  const minH = minHorizontalPx(canvasWidth)
  const maxV =
    canvasHeight > 0
      ? Math.min(UNDO_LEFT_MAX_VERTICAL_PX, canvasHeight * 0.22)
      : UNDO_LEFT_MAX_VERTICAL_PX

  let shouldUndo = false
  if (samples.length >= 3) {
    const oldest = samples[0]
    const newest = samples[samples.length - 1]
    if (oldest && newest) {
      const span = newest.t - oldest.t
      const dx = oldest.x - newest.x
      const dy = newest.y - oldest.y

      const horizontalEnough = dx >= minH
      const verticalBounded = Math.abs(dy) <= maxV
      const horizontalDominant =
        Math.abs(dy) < 1e-6
          ? horizontalEnough
          : Math.abs(dx) >= UNDO_LEFT_MIN_HORIZ_DOMINANCE * Math.abs(dy)
      const spanOk = span >= UNDO_LEFT_MIN_SPAN_MS

      if (horizontalEnough && verticalBounded && horizontalDominant && spanOk) {
        shouldUndo = true
      }
    }
  }

  if (shouldUndo) {
    return {
      next: {
        samples: [],
        cooldownUntilMs: nowMs + UNDO_LEFT_COOLDOWN_MS,
      },
      shouldUndo: true,
      statusMessage: 'Left wave detected - undo',
    }
  }

  return {
    next: { samples, cooldownUntilMs: 0 },
    shouldUndo: false,
    statusMessage:
      samples.length >= 3
        ? 'Undo wave: watching (' + samples.length + ' samples, wave index finger left to undo)'
        : 'Undo wave: move index finger clearly left to undo',
  }
}
