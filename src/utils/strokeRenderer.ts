import type { Point, Stroke } from '../types/drawing'

/**
 * Paints vector strokes. Input-agnostic — only consumes `Stroke[]` produced by the model.
 *
 * FUTURE: Multiplayer — replay the same function with strokes received over the wire.
 */
export function renderDrawing(
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  strokes: readonly Stroke[],
  activeStroke: Stroke | null,
): void {
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cssWidth, cssHeight)

  for (const s of strokes) {
    applyStrokeStyle(ctx, s)
    drawSmoothStroke(ctx, s.points)
  }
  if (activeStroke) {
    applyStrokeStyle(ctx, activeStroke)
    drawSmoothStroke(ctx, activeStroke.points)
  }
  ctx.restore()
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  ctx.lineWidth = stroke.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (stroke.mode === 'erase') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = stroke.color
  }
}

function drawSmoothStroke(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  if (points.length === 0) return

  if (points.length === 1) {
    drawCapDot(ctx, points[0])
    return
  }

  if (points.length === 2) {
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    ctx.lineTo(points[1].x, points[1].y)
    ctx.stroke()
    return
  }

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)

  let i = 1
  for (; i < points.length - 2; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2
    const yc = (points[i].y + points[i + 1].y) / 2
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
  }
  ctx.quadraticCurveTo(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y)
  ctx.stroke()
}

function drawCapDot(ctx: CanvasRenderingContext2D, p: Point): void {
  const r = Math.max(ctx.lineWidth / 2, 0.5)
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  const fill =
    ctx.globalCompositeOperation === 'destination-out' ? 'rgba(0,0,0,1)' : (ctx.strokeStyle as string)
  ctx.fillStyle = fill
  ctx.fill()
}
