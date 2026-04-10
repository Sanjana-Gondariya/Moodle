import { useEffect, useRef, type RefObject } from 'react'
import { applyGestureInput } from '../utils/applyGestureInput'
import { clientToCanvasPoint, clampPointToCanvas } from '../utils/coordinateMapping'
import type { DrawingEngine, GestureInputEvent, ToolMode } from '../types/drawing'

function emit(
  engine: DrawingEngine,
  mode: ToolMode,
  action: GestureInputEvent['action'],
  x: number,
  y: number,
): void {
  applyGestureInput(engine, { action, x, y, mode })
}

/**
 * Bridges DOM input → `GestureInputEvent` → `DrawingEngine`.
 *
 * - **Pointer events** handle mouse, pen, and most touch browsers (preferred).
 * - **Touch events** (`touchstart` / `touchmove` / `touchend`) call the same path when a touch
 *   session was *not* already started by a pointer (legacy / rare). If `pointerdown` already
 *   claimed the stroke, touch handlers no-op so strokes are not duplicated.
 *
 * FUTURE: MediaPipe — add `useMediaPipeGestureInput(engine, modeRef)` that calls `applyGestureInput`
 *         from an rAF loop or `onResults` with landmark-projected x/y.
 *
 * FUTURE: Gesture → tool — map closed fist / open hand to `ToolMode` before emitting events.
 */
export function useCanvasPointerInput(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  engine: DrawingEngine,
  modeRef: RefObject<ToolMode>,
  enabled = true,
): void {
  const engineRef = useRef(engine)
  engineRef.current = engine

  const activePointerId = useRef<number | null>(null)
  const activeTouchId = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return

    const mode = () => modeRef.current

    const handlePointerDown = (e: PointerEvent) => {
      if (activePointerId.current !== null) return
      if (e.button !== 0 && e.pointerType === 'mouse') return

      activePointerId.current = e.pointerId
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }

      const p = clampPointToCanvas(canvas, clientToCanvasPoint(canvas, e.clientX, e.clientY))
      emit(engineRef.current, mode(), 'start', p.x, p.y)
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) return

      const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
      for (const ev of coalesced) {
        const p = clampPointToCanvas(canvas, clientToCanvasPoint(canvas, ev.clientX, ev.clientY))
        emit(engineRef.current, mode(), 'move', p.x, p.y)
      }
    }

    const endPointerStroke = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return
      activePointerId.current = null
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      emit(engineRef.current, mode(), 'end', 0, 0)
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (activePointerId.current !== null) return
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (!t) return
      activeTouchId.current = t.identifier
      e.preventDefault()
      const p = clampPointToCanvas(canvas, clientToCanvasPoint(canvas, t.clientX, t.clientY))
      emit(engineRef.current, mode(), 'start', p.x, p.y)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (activeTouchId.current === null) return
      const t = Array.from(e.touches).find((x) => x.identifier === activeTouchId.current)
      if (!t) return
      e.preventDefault()
      const p = clampPointToCanvas(canvas, clientToCanvasPoint(canvas, t.clientX, t.clientY))
      emit(engineRef.current, mode(), 'move', p.x, p.y)
    }

    const endTouchStroke = (e: TouchEvent) => {
      if (activeTouchId.current === null) return
      const stillThere = Array.from(e.touches).some((x) => x.identifier === activeTouchId.current)
      if (stillThere) return
      activeTouchId.current = null
      emit(engineRef.current, mode(), 'end', 0, 0)
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', endPointerStroke)
    canvas.addEventListener('pointercancel', endPointerStroke)
    canvas.addEventListener('lostpointercapture', endPointerStroke)

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', endTouchStroke)
    canvas.addEventListener('touchcancel', endTouchStroke)

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', endPointerStroke)
      canvas.removeEventListener('pointercancel', endPointerStroke)
      canvas.removeEventListener('lostpointercapture', endPointerStroke)

      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', endTouchStroke)
      canvas.removeEventListener('touchcancel', endTouchStroke)
    }
  }, [canvasRef, enabled, engine, modeRef])
}
