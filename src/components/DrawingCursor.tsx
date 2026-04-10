import type { InputState } from '../types/drawing'

export interface DrawingCursorProps {
  sample: InputState | null
}

/**
 * Simple canvas-space cursor. Swap implementation later for a hand mesh or fingertip sprite.
 */
export function DrawingCursor({ sample }: DrawingCursorProps) {
  if (!sample) return null

  return (
    <div
      className={`drawing-cursor${sample.isActive ? ' drawing-cursor--active' : ''}`}
      style={{
        left: sample.x,
        top: sample.y,
      }}
      aria-hidden
    />
  )
}
