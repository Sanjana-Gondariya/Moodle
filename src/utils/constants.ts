/** Default brush color when the app loads. */
export const DEFAULT_BRUSH_COLOR = '#8B5CF6'

export const DEFAULT_BRUSH_SIZE = 4

export const MIN_BRUSH_SIZE = 1

export const MAX_BRUSH_SIZE = 48

/** Ignore jitter closer than this (CSS px) when extending a stroke. */
export const MIN_POINT_DISTANCE = 0.35

/** MediaPipe detection cadence. */
export const MEDIAPIPE_DETECTION_FPS = 30

/** Exponential smoothing defaults for fingertip cursor. */
export const CURSOR_SMOOTHING_MIN_ALPHA = 0.18
export const CURSOR_SMOOTHING_MAX_ALPHA = 0.58
export const CURSOR_SMOOTHING_SPEED_FOR_MAX = 0.95

/**
 * Pinch hysteresis (thumb–index distance / palm size). Schmitt-style: start threshold is
 * **lower** than end threshold so a pinch must open clearly before “release” — reduces chatter.
 *
 * Tune here only (no magic numbers in gestureDetection):
 * - **Lower** `PINCH_START_*` → easier to start drawing (more false starts).
 * - **Higher** `PINCH_END_*` → must open pinch more before stroke ends (stabler line, slower release).
 * - **More frames** → more latency but fewer flicker toggles.
 */
export const PINCH_START_THRESHOLD = 0.33
/** Must exceed this (after palm normalization) to count toward “pinch released” frames. */
export const PINCH_END_THRESHOLD = 0.52
/** Consecutive frames with pinch ratio below start threshold before pinch “on”. */
export const PINCH_START_FRAMES = 4
/** Consecutive frames above end threshold before pinch “off”. */
export const PINCH_END_FRAMES = 5

/**
 * Index (8) vs middle (12) tip distance / palm size — **low** means fingers **together** (erase tool).
 * Schmitt: `CLOSE` < `OPEN` so fingers must separate clearly before leaving erase mode.
 */
export const ERASE_FINGERS_CLOSE_THRESHOLD = 0.2
export const ERASE_FINGERS_OPEN_THRESHOLD = 0.32
export const ERASE_MODE_ON_FRAMES = 4
export const ERASE_MODE_OFF_FRAMES = 5

/** Open-palm clear: hold this long after stability before `engine.clear()`. */
export const OPEN_PALM_CLEAR_HOLD_MS = 7000

/** Consecutive open-palm frames required before the 7s countdown starts (reduces accidents). */
export const OPEN_PALM_STABLE_FRAMES_BEFORE_HOLD = 10

/** Min vertical gap (normalized) tip above PIP for a finger to count as extended. */
export const OPEN_PALM_FINGER_UP_MARGIN = 0.022

/** Index tip trail for horizontal wave gestures: undo = left, redo = right (same thresholds). */
export const UNDO_LEFT_WAVE_WINDOW_MS = 420
export const UNDO_LEFT_MIN_SPAN_MS = 100
export const UNDO_LEFT_MIN_HORIZONTAL_PX = 52
export const UNDO_LEFT_MIN_HORIZONTAL_FRAC = 0.085
export const UNDO_LEFT_MAX_VERTICAL_PX = 90
export const UNDO_LEFT_MIN_HORIZ_DOMINANCE = 2.2
export const UNDO_LEFT_MAX_SAMPLES = 48
export const UNDO_LEFT_COOLDOWN_MS = 1400
