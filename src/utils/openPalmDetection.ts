import type { NormalizedLandmark } from '../types/drawing'
import { OPEN_PALM_FINGER_UP_MARGIN } from './constants'

/**
 * In MediaPipe hand image space, y grows downward. A finger is considered **extended** when the
 * tip is **above** (smaller y than) the proximal interphalangeal joint by at least `margin`.
 *
 * **Open palm / open hand** (for clear-canvas hold): index, middle, ring, and pinky are all extended.
 * Thumb is not required to be extended (natural rest vs. camera).
 *
 * This is intentionally **not** “closed fist” — a fist fails because tips are not above PIPs.
 */
export function isFingerExtended(
  tip: NormalizedLandmark,
  pip: NormalizedLandmark,
  margin = OPEN_PALM_FINGER_UP_MARGIN,
): boolean {
  return tip.y < pip.y - margin
}

/**
 * True when the hand matches an open-palm pose suitable for starting the clear hold timer.
 * Excludes pinch (draw trigger) and index+middle erase pose so we do not fight those gestures.
 */
export function isOpenPalmClearCandidate(
  landmarks: NormalizedLandmark[],
  opts: { pinchActive: boolean; eraseModeActive: boolean },
): boolean {
  if (opts.pinchActive || opts.eraseModeActive) return false
  if (landmarks.length < 21) return false

  const i = isFingerExtended(landmarks[8], landmarks[6])
  const m = isFingerExtended(landmarks[12], landmarks[10])
  const r = isFingerExtended(landmarks[16], landmarks[14])
  const p = isFingerExtended(landmarks[20], landmarks[18])
  return i && m && r && p
}
