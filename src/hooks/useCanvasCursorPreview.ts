import { useEffect, useState, type RefObject } from 'react'
import { clientToCanvasPoint, clampPointToCanvas } from '../utils/coordinateMapping'
import type { InputState, ToolMode } from '../types/drawing'

/**
 * Tracks pointer position over the canvas for a lightweight preview dot.
 *
 * FUTURE: MediaPipe — replace pointer listeners with landmark-driven x/y updates each frame;
 *         keep returning the same `InputState` shape for the overlay component.
 */
export function useCanvasCursorPreview(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  modeRef: RefObject<ToolMode>,
): InputState | null {
  const [sample, setSample] = useState<InputState | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const inside = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      )
    }

    const onMove = (e: PointerEvent) => {
      if (!inside(e)) {
        setSample(null)
        return
      }
      const p = clampPointToCanvas(canvas, clientToCanvasPoint(canvas, e.clientX, e.clientY))
      setSample({
        x: p.x,
        y: p.y,
        isActive: (e.buttons & 1) !== 0,
        mode: modeRef.current,
      })
    }

    const onLeave = () => setSample(null)

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (!t) return
      const p = clampPointToCanvas(canvas, clientToCanvasPoint(canvas, t.clientX, t.clientY))
      setSample({
        x: p.x,
        y: p.y,
        isActive: true,
        mode: modeRef.current,
      })
    }

    const onTouchEnd = () => setSample(null)

    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('pointerdown', onMove)
    canvas.addEventListener('pointerup', onMove)
    canvas.addEventListener('touchmove', onTouchMove, { passive: true })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('touchcancel', onTouchEnd)

    return () => {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerdown', onMove)
      canvas.removeEventListener('pointerup', onMove)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [canvasRef, modeRef])

  return sample
}
