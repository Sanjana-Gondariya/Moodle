import type { Point, Stroke, ToolMode } from '../types/drawing'
import { MIN_POINT_DISTANCE } from './constants'

export function newStrokeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createStroke(
  x: number,
  y: number,
  color: string,
  size: number,
  mode: ToolMode,
  now?: number,
): Stroke {
  const p: Point = { x, y }
  if (now !== undefined) p.t = now
  return {
    id: newStrokeId(),
    points: [p],
    color,
    size,
    mode,
  }
}

export function appendPoint(stroke: Stroke, x: number, y: number, now?: number): Stroke {
  const p: Point = { x, y }
  if (now !== undefined) p.t = now
  return {
    ...stroke,
    points: [...stroke.points, p],
  }
}

export function shouldAppendPoint(
  prev: Point | undefined,
  x: number,
  y: number,
  minDist = MIN_POINT_DISTANCE,
): boolean {
  if (!prev) return true
  const dx = x - prev.x
  const dy = y - prev.y
  return dx * dx + dy * dy >= minDist * minDist
}
