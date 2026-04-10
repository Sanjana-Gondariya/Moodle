import {
  OPEN_PALM_CLEAR_HOLD_MS,
  OPEN_PALM_STABLE_FRAMES_BEFORE_HOLD,
} from './constants'

/** Internal state for the 7s open-palm clear hold (advance once per tracking frame). */
export interface OpenPalmClearHoldState {
  /** Consecutive frames with a valid open-palm candidate (resets on break or pinch). */
  stableOpenPalmFrames: number
  /** Start time of the 7s window after stability is reached; null while not holding. */
  holdStartMs: number | null
  /**
   * After a successful clear, suppress starting a new hold until the user breaks the open-palm
   * pose (prevents immediate re-trigger if the hand stays open).
   */
  blockNewHoldUntilPalmBreak: boolean
}

export const INITIAL_OPEN_PALM_CLEAR_HOLD_STATE: OpenPalmClearHoldState = {
  stableOpenPalmFrames: 0,
  holdStartMs: null,
  blockNewHoldUntilPalmBreak: false,
}

export type ClearHoldUiPhase =
  | 'idle'
  | 'clear_gesture_detected'
  | 'holding_to_clear'
  | 're_arm_required'

export interface ClearHoldUi {
  phase: ClearHoldUiPhase
  elapsedMs: number
  progress01: number
  secondsRemaining: number
  /** Short line for status panel / aria. */
  message: string
}

export interface AdvanceOpenPalmClearHoldInput {
  nowMs: number
  /** From `isOpenPalmClearCandidate` (same frame). */
  openPalmCandidate: boolean
  /** Pinch active cancels hold (gesture changed / draw intent). */
  pinchActive: boolean
  holdDurationMs: number
  stableFramesBeforeHold: number
}

/**
 * Stable timer: only counts toward 7s after `stableFramesBeforeHold` consecutive open-palm frames.
 * Any loss of candidate, pinch, or tracking reset (handled by caller passing openPalmCandidate false).
 * After `clearCanvas` fires once, `blockNewHoldUntilPalmBreak` requires an open-palm-off frame
 * before a new hold can start.
 */
export function advanceOpenPalmClearHold(
  input: AdvanceOpenPalmClearHoldInput,
  prev: OpenPalmClearHoldState,
): { next: OpenPalmClearHoldState; clearCanvas: boolean; ui: ClearHoldUi } {
  const {
    nowMs,
    openPalmCandidate,
    pinchActive,
    holdDurationMs,
    stableFramesBeforeHold,
  } = input

  let next: OpenPalmClearHoldState = { ...prev }
  let clearCanvas = false

  const baseIdleUi = (message: string): ClearHoldUi => ({
    phase: 'idle',
    elapsedMs: 0,
    progress01: 0,
    secondsRemaining: Math.ceil(holdDurationMs / 1000),
    message,
  })

  // Pinch always cancels clear hold (do not change pinch behavior elsewhere).
  if (pinchActive) {
    const hadClearProgress = prev.holdStartMs !== null || prev.stableOpenPalmFrames > 0
    next = {
      ...prev,
      stableOpenPalmFrames: 0,
      holdStartMs: null,
      // Keep block flag — user did not “release palm”, they pinched.
      blockNewHoldUntilPalmBreak: prev.blockNewHoldUntilPalmBreak,
    }
    return {
      next,
      clearCanvas: false,
      ui: baseIdleUi(
        hadClearProgress
          ? 'Clear hold cancelled (pinch).'
          : 'Open palm hold: show open hand and keep it steady for 7s to clear.',
      ),
    }
  }

  if (!openPalmCandidate) {
    next.stableOpenPalmFrames = 0
    next.holdStartMs = null
    if (prev.blockNewHoldUntilPalmBreak) {
      next.blockNewHoldUntilPalmBreak = false
    }
    return {
      next,
      clearCanvas: false,
      ui: baseIdleUi('Open palm hold: show open hand and keep it steady for 7s to clear.'),
    }
  }

  // openPalmCandidate true, not pinching
  if (next.blockNewHoldUntilPalmBreak) {
    return {
      next,
      clearCanvas: false,
      ui: {
        phase: 're_arm_required',
        elapsedMs: 0,
        progress01: 0,
        secondsRemaining: Math.ceil(holdDurationMs / 1000),
        message: 'Canvas cleared. Open hand away, then you can use clear hold again.',
      },
    }
  }

  next.stableOpenPalmFrames = prev.stableOpenPalmFrames + 1

  if (next.stableOpenPalmFrames < stableFramesBeforeHold) {
    next.holdStartMs = null
    return {
      next,
      clearCanvas: false,
      ui: {
        phase: 'clear_gesture_detected',
        elapsedMs: 0,
        progress01: 0,
        secondsRemaining: Math.ceil(holdDurationMs / 1000),
        message: 'Clear gesture detected — keep holding open palm…',
      },
    }
  }

  if (next.holdStartMs === null) {
    next.holdStartMs = nowMs
  }

  const elapsedMs = Math.max(0, nowMs - next.holdStartMs)
  const progress01 = Math.min(1, elapsedMs / holdDurationMs)
  const secondsRemaining = Math.max(0, Math.ceil((holdDurationMs - elapsedMs) / 1000))

  if (elapsedMs >= holdDurationMs) {
    clearCanvas = true
    next = {
      stableOpenPalmFrames: 0,
      holdStartMs: null,
      blockNewHoldUntilPalmBreak: true,
    }
    return {
      next,
      clearCanvas: true,
      ui: {
        phase: 'idle',
        elapsedMs: holdDurationMs,
        progress01: 1,
        secondsRemaining: 0,
        message: 'Canvas cleared.',
      },
    }
  }

  return {
    next,
    clearCanvas: false,
    ui: {
      phase: 'holding_to_clear',
      elapsedMs,
      progress01,
      secondsRemaining,
      message: `Holding to clear… ${secondsRemaining}s left (${Math.round(progress01 * 100)}%)`,
    },
  }
}
