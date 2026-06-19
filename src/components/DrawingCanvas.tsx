import { useCallback, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { renderDrawing } from '../utils/strokeRenderer'
import { useCanvasCursorPreview } from '../hooks/useCanvasCursorPreview'
import { DrawingCursor } from './DrawingCursor'
import { clientToCanvasPoint, clampPointToCanvas } from '../utils/coordinateMapping'
import type { DrawingEngine, Stroke, ToolMode } from '../types/drawing'

export interface DrawingCanvasProps {
  strokes: readonly Stroke[]
  activeStroke: Stroke | null
  engine: DrawingEngine
  /** Current tool mode — forwarded into gesture packets and cursor preview. */
  toolMode: ToolMode
  pointerEnabled?: boolean
  cursorOverride?: { x: number; y: number; isActive: boolean; mode: ToolMode } | null
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void
}

/**
 * Canvas surface + resize + replay. DOM input lives in hooks; this file stays thin.
 *
 * FUTURE: Webcam — add a sibling `<video>` with `pointer-events: none` aligned to this wrapper.
 */
export function DrawingCanvas({
  strokes,
  activeStroke,
  engine,
  toolMode,
  pointerEnabled = true,
  cursorOverride = null,
  onCanvasReady,
}: DrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const modeRef = useRef(toolMode)
  modeRef.current = toolMode
  const activePointerId = useRef<number | null>(null)

  const snapshotRef = useRef({ strokes, activeStroke })
  snapshotRef.current = { strokes, activeStroke }

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.width / dpr
    const cssH = canvas.height / dpr
    const { strokes: s, activeStroke: a } = snapshotRef.current
    renderDrawing(ctx, cssW, cssH, s, a)
  }, [])

  useLayoutEffect(() => {
    paint()
  }, [strokes, activeStroke, paint])

  useLayoutEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const applySizeAndPaint = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      const cssW = Math.max(1, Math.floor(rect.width))
      const cssH = Math.max(1, Math.floor(rect.height))

      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctxRef.current = ctx
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paint()
    }

    applySizeAndPaint()
    const ro = new ResizeObserver(applySizeAndPaint)
    ro.observe(container)
    return () => ro.disconnect()
  }, [paint])

  useLayoutEffect(() => {
    onCanvasReady?.(canvasRef.current)
    return () => onCanvasReady?.(null)
  }, [onCanvasReady])

  const pointerSample = useCanvasCursorPreview(canvasRef, modeRef)
  const cursorSample = cursorOverride ?? pointerSample

  const canvasPointFromPointer = useCallback((event: ReactPointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return clampPointToCanvas(canvas, clientToCanvasPoint(canvas, event.clientX, event.clientY))
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointerEnabled) return
      if (activePointerId.current !== null) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const point = canvasPointFromPointer(event)
      if (!point) return

      activePointerId.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      engine.startStroke(point.x, point.y, modeRef.current)
      event.preventDefault()
    },
    [canvasPointFromPointer, engine, pointerEnabled],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointerEnabled) return
      if (event.pointerId !== activePointerId.current) return
      if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) return
      const point = canvasPointFromPointer(event)
      if (!point) return

      engine.continueStroke(point.x, point.y)
      event.preventDefault()
    },
    [canvasPointFromPointer, engine, pointerEnabled],
  )

  const endPointerStroke = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerId !== activePointerId.current) return
      activePointerId.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      engine.endStroke()
      event.preventDefault()
    },
    [engine],
  )

  return (
    <div className="drawing-canvas__wrap">
      <div
        ref={containerRef}
        className="drawing-canvas__surface"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointerStroke}
        onPointerCancel={endPointerStroke}
        onLostPointerCapture={endPointerStroke}
      >
        <canvas
          ref={canvasRef}
          className="drawing-canvas"
          role="img"
          aria-label="Drawing canvas — use mouse or touch to draw"
        />
        <DrawingCursor sample={cursorSample} />
      </div>
    </div>
  )
}
