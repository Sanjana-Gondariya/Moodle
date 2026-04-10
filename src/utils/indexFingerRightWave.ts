/**
 * Deliberate rightward swipe of index fingertip (landmark 8) in canvas CSS px.
 * Mirrors indexFingerLeftWave (undo) with opposite horizontal displacement; uses the same
 * UNDO_LEFT_* motion constants so both gestures stay equally strict.
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

export interface IndexFingerRightWaveState {
  samples: FingerTrailSample[]
  cooldownUntilMs: number
}

export const INITIAL_INDEX_FINGER_RIGHT_WAVE_STATE: IndexFingerRightWaveState = {
  samples: [],
  cooldownUntilMs: 0,
}

export interface AdvanceIndexFingerRightWaveInput {
  nowMs: number
  x: number
  y: number
  canvasWidth: number
  canvasHeight: number
  recordSample: boolean
}

export interface IndexFingerRightWaveResult {
  next: IndexFingerRightWaveState
  shouldRedo: boolean
  statusMessage: string
}

function minHorizontalPx(canvasWidth: number): number {
  return Math.max(UNDO_LEFT_MIN_HORIZONTAL_PX, canvasWidth * UNDO_LEFT_MIN_HORIZONTAL_FRAC)
}

function pruneWindow(samples: FingerTrailSample[], nowMs: number, windowMs: number): FingerTrailSample[] {
  const cutoff = nowMs - windowMs
  return samples.filter((s) => s.t >= cutoff)
}

export function advanceIndexFingerRightWave(
  input: AdvanceIndexFingerRightWaveInput,
  prev: IndexFingerRightWaveState,
): IndexFingerRightWaveResult {
  const { nowMs, x, y, canvasWidth, canvasHeight, recordSample } = input

  if (nowMs < prev.cooldownUntilMs) {
    const msLeft = Math.ceil(prev.cooldownUntilMs - nowMs)
    return {
      next: { samples: [], cooldownUntilMs: prev.cooldownUntilMs },
      shouldRedo: false,
      statusMessage: 'Redo wave: cooldown (' + msLeft + 'ms)',
    }
  }

  if (!recordSample) {
    return {
      next: { samples: [], cooldownUntilMs: prev.cooldownUntilMs },
      shouldRedo: false,
      statusMessage: 'Redo wave: idle (paused during pinch or clear hold)',
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

  let shouldRedo = false
  if (samples.length >= 3) {
    const oldest = samples[0]
    const newest = samples[samples.length - 1]
    if (oldest && newest) {
      const span = newest.t - oldest.t
      const dx = newest.x - oldest.x
      const dy = newest.y - oldest.y

      const horizontalEnough = dx >= minH
      const verticalBounded = Math.abs(dy) <= maxV
      const horizontalDominant =
        Math.abs(dy) < 1e-6
          ? horizontalEnough
          : Math.abs(dx) >= UNDO_LEFT_MIN_HORIZ_DOMINANCE * Math.abs(dy)
      const spanOk = span >= UNDO_LEFT_MIN_SPAN_MS

      if (horizontalEnough && verticalBounded && horizontalDominant && spanOk) {
        shouldRedo = true
      }
    }
  }

  if (shouldRedo) {
    return {
      next: {
        samples: [],
        cooldownUntilMs: nowMs + UNDO_LEFT_COOLDOWN_MS,
      },
      shouldRedo: true,
      statusMessage: 'Right wave detected - redo',
    }
  }

  return {
    next: { samples, cooldownUntilMs: 0 },
    shouldRedo: false,
    statusMessage:
      samples.length >= 3
        ? 'Redo wave: watching (' + samples.length + ' samples, wave index finger right to redo)'
        : 'Redo wave: move index finger clearly right to redo',
  }
}
