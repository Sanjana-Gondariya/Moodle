import type { Point } from '../types/drawing'

/**
 * Map viewport client coordinates → canvas **CSS pixel** coordinates.
 * Single place for rect math so MediaPipe can reuse the same final step.
 *
 * FUTURE: MediaPipe — compute clientX/clientY (or raw x/y) from INDEX_FINGER_TIP after
 *         projecting into the layout box of the canvas, then pass through here.
 */
export function clientToCanvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): Point {
  const rect = canvas.getBoundingClientRect()
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  }
}

/** Clamp a point inside canvas bounds (useful for cursor preview + stray samples). */
export function clampPointToCanvas(canvas: HTMLCanvasElement, p: Point): Point {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  return {
    x: Math.min(Math.max(p.x, 0), w),
    y: Math.min(Math.max(p.y, 0), h),
  }
}

export interface MappingCalibration {
  offsetX: number
  offsetY: number
  scaleX: number
  scaleY: number
}

export const DEFAULT_MAPPING_CALIBRATION: MappingCalibration = {
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
}

/**
 * Maps normalized source coords (0..1) into canvas CSS space.
 *
 * FUTURE: For mobile + different camera FOVs, inject calibration from a quick calibration step.
 */
export function normalizedToCanvasPoint(
  canvas: HTMLCanvasElement,
  nx: number,
  ny: number,
  calibration: MappingCalibration = DEFAULT_MAPPING_CALIBRATION,
): Point {
  const raw = {
    x: nx * canvas.clientWidth * calibration.scaleX + calibration.offsetX,
    y: ny * canvas.clientHeight * calibration.scaleY + calibration.offsetY,
  }
  return clampPointToCanvas(canvas, raw)
}

/**
 * Maps MediaPipe **hand** landmarks (normalized 0..1) to canvas CSS pixels for a typical
 * **front-facing (selfie) camera**.
 *
 * **Mirror / flip (horizontal only):** Landmark `x` is in the camera’s image space (sensor
 * left → right). That is *not* the same as “my left / my right” on screen for a selfie feed.
 * Users expect mirror-like control: when they move their hand toward *their* left, the cursor
 * moves left on the canvas. That matches applying **`x → 1 - x`** before scaling to canvas width.
 *
 * This is independent of any CSS `transform: scaleX(-1)` on a `<video>` preview — MediaPipe
 * reads the real frame; mirroring the video in CSS does not flip landmark math. Flip belongs here.
 *
 * If you ever switch to a rear camera or need sensor-true mapping, set `mirrorX` to `false`.
 */
export function handLandmarkToCanvasPoint(
  canvas: HTMLCanvasElement,
  nx: number,
  ny: number,
  calibration: MappingCalibration = DEFAULT_MAPPING_CALIBRATION,
  mirrorX = true,
): Point {
  const x = mirrorX ? 1 - nx : nx
  return normalizedToCanvasPoint(canvas, x, ny, calibration)
}
