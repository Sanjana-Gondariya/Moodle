import { useCallback, useEffect, useRef, useState } from 'react'
import { DrawingCanvas } from './components/DrawingCanvas'
import { GestureStatusPanel } from './components/GestureStatusPanel'
import { Toolbar } from './components/Toolbar'
import { useGestureInputController } from './hooks/useGestureInputController'
import { useMediaPipeHandTracking } from './hooks/useMediaPipeHandTracking'
import { useDrawingState } from './hooks/useDrawingState'
import { DEFAULT_BRUSH_COLOR, DEFAULT_BRUSH_SIZE } from './utils/constants'
import type { ToolMode } from './types/drawing'
import './App.css'

/**
 * Composes tool UI + drawing model + canvas view. Transport and ML stay out of this file.
 *
 * FUTURE: Socket.IO — subscribe to remote `Stroke` payloads and merge into the same model.
 * FUTURE: MediaPipe — mount gesture hook alongside `useCanvasPointerInput` (or behind a flag)
 *         and feed the shared `DrawingEngine` from landmark-driven coordinates.
 */
function App() {
  const { strokes, activeStroke, engine, syncToolSettings, canUndo, canRedo } = useDrawingState()
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)

  const [color, setColor] = useState(DEFAULT_BRUSH_COLOR)
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE)
  const [mode, setMode] = useState<ToolMode>('draw')
  const [gestureEnabled, setGestureEnabled] = useState(true)

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasElRef.current = canvas
  }, [])

  const handleClear = useCallback(() => {
    if (!window.confirm('Are you sure you want to clear the entire canvas?')) {
      return
    }
    engine.clear()
  }, [engine])

  const tracking = useMediaPipeHandTracking(gestureEnabled)
  const { status, preview } = useGestureInputController({
    frame: tracking.frame,
    canvas: canvasElRef.current,
    engine,
    gestureEnabled,
    setMode,
  })

  useEffect(() => {
    syncToolSettings({ color, brushSize, mode })
  }, [color, brushSize, mode, syncToolSettings])

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">
          <span className="app__logo" aria-hidden>
            ✏️
          </span>{' '}
          <span className="app__title-word app__title-word--purple">Doodle</span>{' '}
          <span className="app__title-word app__title-word--coral">Canvas</span>
        </h1>
        <p className="app__tagline">Let your creativity flow! Draw anything you can imagine.</p>
      </header>

      <Toolbar
        mode={mode}
        onModeChange={setMode}
        color={color}
        onColorChange={setColor}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        onClear={handleClear}
        onUndo={engine.undo}
        onRedo={engine.redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <section className="gesture-panel">
        <label className="gesture-panel__toggle">
          <input
            type="checkbox"
            checked={gestureEnabled}
            onChange={(e) => setGestureEnabled(e.target.checked)}
          />
          <span>Gesture mode (MediaPipe)</span>
        </label>
        {/* Hidden capture surface: MediaPipe needs a playing video element; do not show the feed in UI. */}
        <video
          ref={tracking.videoRef}
          className="webcam-hidden"
          playsInline
          muted
          autoPlay
          aria-hidden
        />
        <GestureStatusPanel
          webcamReady={tracking.webcamReady}
          mediaPipeReady={tracking.mediaPipeReady}
          error={tracking.error}
          status={status}
          currentToolMode={mode}
        />
      </section>

      <main className="app__main">
        <DrawingCanvas
          strokes={strokes}
          activeStroke={activeStroke}
          engine={engine}
          toolMode={mode}
          pointerEnabled={!gestureEnabled || !status.handDetected}
          cursorOverride={gestureEnabled ? preview : null}
          onCanvasReady={handleCanvasReady}
        />
      </main>

      <footer className="app__footer">
        <p>
          Draw with mouse or touch. Use draw and erase modes, pick a color and brush size, and use
          undo/redo as needed.
        </p>
      </footer>
    </div>
  )
}

export default App
