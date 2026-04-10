import { useCallback, useMemo, useReducer, useRef } from 'react'
import { appendPoint, createStroke, shouldAppendPoint } from '../utils/strokeUtils'
import type { DrawingEngine, Stroke, ToolMode } from '../types/drawing'
import { DEFAULT_BRUSH_COLOR, DEFAULT_BRUSH_SIZE } from '../utils/constants'

interface ModelState {
  strokes: Stroke[]
  activeStroke: Stroke | null
  redoStack: Stroke[]
}

const initialModel: ModelState = {
  strokes: [],
  activeStroke: null,
  redoStack: [],
}

type Action =
  | {
      type: 'START_STROKE'
      x: number
      y: number
      color: string
      size: number
      mode: ToolMode
    }
  | { type: 'CONTINUE_STROKE'; x: number; y: number }
  | { type: 'END_STROKE' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CLEAR' }

function modelReducer(state: ModelState, action: Action): ModelState {
  switch (action.type) {
    case 'START_STROKE': {
      if (state.activeStroke) return state
      const s = createStroke(
        action.x,
        action.y,
        action.color,
        action.size,
        action.mode,
        typeof performance !== 'undefined' ? performance.now() : undefined,
      )
      return { ...state, activeStroke: s, redoStack: [] }
    }
    case 'CONTINUE_STROKE': {
      if (!state.activeStroke) return state
      return {
        ...state,
        activeStroke: appendPoint(
          state.activeStroke,
          action.x,
          action.y,
          typeof performance !== 'undefined' ? performance.now() : undefined,
        ),
      }
    }
    case 'END_STROKE': {
      const a = state.activeStroke
      if (!a) return state
      if (a.points.length === 0) {
        return { ...state, activeStroke: null }
      }
      return {
        ...state,
        strokes: [...state.strokes, a],
        activeStroke: null,
        redoStack: [],
      }
    }
    case 'UNDO': {
      if (state.activeStroke) {
        return { ...state, activeStroke: null, redoStack: [] }
      }
      if (state.strokes.length === 0) return state
      const last = state.strokes[state.strokes.length - 1]!
      return {
        ...state,
        strokes: state.strokes.slice(0, -1),
        redoStack: [last, ...state.redoStack],
      }
    }
    case 'REDO': {
      if (state.activeStroke) {
        return { ...state, activeStroke: null }
      }
      if (state.redoStack.length === 0) return state
      const [next, ...rest] = state.redoStack
      return {
        ...state,
        strokes: [...state.strokes, next],
        redoStack: rest,
      }
    }
    case 'CLEAR':
      return { strokes: [], activeStroke: null, redoStack: [] }
    default:
      return state
  }
}

export interface ToolSettings {
  color: string
  brushSize: number
  mode: ToolMode
}

const DEFAULT_TOOLS: ToolSettings = {
  color: DEFAULT_BRUSH_COLOR,
  brushSize: DEFAULT_BRUSH_SIZE,
  mode: 'draw',
}

/**
 * Stroke-based model + undo/redo. No knowledge of DOM or MediaPipe.
 *
 * FUTURE: Multiplayer — push/pop strokes from network; same reducer shape.
 * FUTURE: ML — export `model.strokes` as JSON / flatten to polylines.
 */
export function useDrawingState() {
  const [model, dispatch] = useReducer(modelReducer, initialModel)
  const modelRef = useRef(model)
  modelRef.current = model

  const toolRef = useRef<ToolSettings>(DEFAULT_TOOLS)

  const startStroke = useCallback((x: number, y: number, modeOverride?: ToolMode) => {
    const t = toolRef.current
    const mode = modeOverride ?? t.mode
    dispatch({
      type: 'START_STROKE',
      x,
      y,
      color: t.color,
      size: t.brushSize,
      mode,
    })
  }, [])

  const continueStroke = useCallback((x: number, y: number) => {
    const active = modelRef.current.activeStroke
    const prev = active?.points[active.points.length - 1]
    if (!shouldAppendPoint(prev, x, y)) return
    dispatch({ type: 'CONTINUE_STROKE', x, y })
  }, [])

  const endStroke = useCallback(() => {
    dispatch({ type: 'END_STROKE' })
  }, [])

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' })
  }, [])

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' })
  }, [])

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' })
  }, [])

  const engine: DrawingEngine = useMemo(
    () => ({
      startStroke,
      continueStroke,
      endStroke,
      undo,
      redo,
      clear,
    }),
    [startStroke, continueStroke, endStroke, undo, redo, clear],
  )

  const syncToolSettings = useCallback((t: ToolSettings) => {
    toolRef.current = t
  }, [])

  return {
    strokes: model.strokes,
    activeStroke: model.activeStroke,
    canUndo: model.strokes.length > 0 || model.activeStroke !== null,
    canRedo: model.redoStack.length > 0,
    engine,
    syncToolSettings,
  }
}
