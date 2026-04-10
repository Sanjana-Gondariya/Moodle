import { useCallback, useLayoutEffect, useRef } from 'react'
import { renderDrawing } from '../utils/strokeRenderer'
import { useCanvasPointerInput } from '../hooks/useCanvasPointerInput'
import { useCanvasCursorPreview } from '../hooks/useCanvasCursorPreview'
import { DrawingCursor } from './DrawingCursor'
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

  useCanvasPointerInput(canvasRef, engine, modeRef, pointerEnabled)
  const pointerSample = useCanvasCursorPreview(canvasRef, modeRef)
  const cursorSample = cursorOverride ?? pointerSample

  return (
    <div ref={containerRef} className="drawing-canvas__wrap">
      <div className="drawing-canvas__surface">
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
