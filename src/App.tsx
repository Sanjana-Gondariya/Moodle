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

function PixelBackdrop() {
  return (
    <>
      <div className="sky-bg" />
      <svg
        className="mountain-layer"
        viewBox="0 0 1440 280"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <polygon points="0,280 150,90 300,280" fill="#4A7878" />
        <polygon points="80,280 240,110 400,280" fill="#3A6868" />
        <polygon points="260,280 480,68 700,280" fill="#4A8080" />
        <polygon points="460,280 660,88 860,280" fill="#3A6868" />
        <polygon points="680,280 880,55 1080,280" fill="#4A7878" />
        <polygon points="900,280 1100,78 1300,280" fill="#3A6060" />
        <polygon points="1080,280 1280,98 1440,280 1440,280 0,280" fill="#4A7878" />
        <polygon points="150,90 133,134 167,134" fill="#D8E8F8" />
        <polygon points="480,68 460,116 500,116" fill="#E0EEF8" />
        <polygon points="880,55 858,106 902,106" fill="#E0EEF8" />
        <polygon points="0,280 190,148 380,280" fill="#2E5050" />
        <polygon points="260,280 450,118 640,280" fill="#3A6060" />
        <polygon points="560,280 780,128 1000,280" fill="#2E5050" />
        <polygon points="860,280 1060,108 1260,280" fill="#3A6060" />
        <polygon points="1180,280 1360,148 1440,280" fill="#2E5050" />
        <polygon points="190,148 172,196 208,196" fill="#F0F8FF" />
        <polygon points="450,118 430,166 470,166" fill="#E8F4FF" />
        <polygon points="780,128 758,178 802,178" fill="#F0F8FF" />
        <polygon points="1060,108 1040,158 1080,158" fill="#E8F4FF" />
        <rect x="0" y="262" width="1440" height="18" fill="#264040" />
      </svg>
      <div className="cloud-layer" aria-hidden>
        <svg className="cloud c1" width="200" height="88" viewBox="0 0 200 88">
          <rect x="44" y="52" width="112" height="28" fill="#E8F4FF" />
          <rect x="30" y="42" width="44" height="18" fill="#E8F4FF" />
          <rect x="70" y="34" width="60" height="22" fill="#E8F4FF" />
          <rect x="124" y="44" width="36" height="16" fill="#E8F4FF" />
          <rect x="44" y="64" width="112" height="10" fill="#C8D8F0" />
        </svg>
        <svg className="cloud c2" width="140" height="70" viewBox="0 0 140 70">
          <rect x="28" y="36" width="84" height="24" fill="#EEF8FF" />
          <rect x="18" y="28" width="38" height="16" fill="#EEF8FF" />
          <rect x="52" y="22" width="46" height="18" fill="#EEF8FF" />
          <rect x="92" y="30" width="30" height="14" fill="#EEF8FF" />
          <rect x="28" y="50" width="84" height="10" fill="#D0E4F8" />
        </svg>
        <svg className="cloud c3" width="170" height="78" viewBox="0 0 170 78">
          <rect x="36" y="46" width="98" height="24" fill="#F0F8FF" />
          <rect x="24" y="36" width="40" height="18" fill="#F0F8FF" />
          <rect x="60" y="28" width="54" height="22" fill="#F0F8FF" />
          <rect x="108" y="38" width="34" height="16" fill="#F0F8FF" />
          <rect x="36" y="58" width="98" height="10" fill="#D4E8F8" />
        </svg>
      </div>
      <svg
        className="ground-strip"
        viewBox="0 0 1440 28"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <rect x="0" y="0" width="1440" height="12" fill="#264040" />
        <rect x="0" y="12" width="1440" height="8" fill="#1A2E2E" />
        <rect x="0" y="20" width="1440" height="8" fill="#0E1E1E" />
        <rect x="40" y="0" width="8" height="4" fill="#38C040" />
        <rect x="160" y="0" width="8" height="4" fill="#38C040" />
        <rect x="360" y="0" width="8" height="4" fill="#38C040" />
        <rect x="600" y="0" width="8" height="4" fill="#38C040" />
        <rect x="800" y="0" width="8" height="4" fill="#38C040" />
        <rect x="1050" y="0" width="8" height="4" fill="#38C040" />
        <rect x="1280" y="0" width="8" height="4" fill="#38C040" />
      </svg>
    </>
  )
}

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
  const [instructionsOpen, setInstructionsOpen] = useState(false)

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
    <>
      <PixelBackdrop />
      <div className="app">
        <header className="app__header">
          <div>
            <p className="app__eyebrow">Drawing workspace</p>
            <h1 className="app__title">Moodle</h1>
          </div>
          <div className="round-box" aria-label="Round">
            <span className="r-lbl">ROUND</span>
            <span className="r-num">1 / 3</span>
          </div>
        </header>

        <section className="word-bar" aria-label="Prompt">
          <button
            type="button"
            className="instructions-btn"
            onClick={() => setInstructionsOpen(true)}
            aria-haspopup="dialog"
          >
            ?
          </button>
          <div className="word-bar__prompt" aria-label="Current word">
            {'MOODLE'.split('').map((char, index) => (
              <span key={`${char}-${index}`} className={`wch${char === ' ' ? ' spc' : ''}`}>
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </div>
        </section>

        <main className="game-grid">
          <aside className="game-side px-panel" aria-label="Players">
            <div className="px-panel-title">PLAYERS</div>
            <div className="side-list">
              <div className="gp-card drawing">
                <span className="gp-av">🐱</span>
                <span className="gp-info">
                  <span className="gp-nm">You</span>
                  <span className="gp-sc">Drawing</span>
                </span>
                <span className="draw-ind">✎</span>
              </div>
              <div className="gp-card guessed">
                <span className="gp-av">🐟</span>
                <span className="gp-info">
                  <span className="gp-nm">Pixel Pal</span>
                  <span className="gp-sc">240</span>
                </span>
              </div>
              <div className="gp-card">
                <span className="gp-av">⭐</span>
                <span className="gp-info">
                  <span className="gp-nm">Sketch Fan</span>
                  <span className="gp-sc">180</span>
                </span>
              </div>
            </div>
          </aside>

          <section className="game-board">
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

            <div className="canvas-shell">
              <DrawingCanvas
                strokes={strokes}
                activeStroke={activeStroke}
                engine={engine}
                toolMode={mode}
                pointerEnabled={!gestureEnabled || !status.handDetected}
                cursorOverride={gestureEnabled ? preview : null}
                onCanvasReady={handleCanvasReady}
              />
              <span className="cc tl" aria-hidden />
              <span className="cc tr" aria-hidden />
              <span className="cc bl" aria-hidden />
              <span className="cc br" aria-hidden />
            </div>
          </section>

          <aside className="game-side px-panel" aria-label="Gesture controls">
            <div className="px-panel-title">GESTURES</div>
            <section className="gesture-panel">
              <label className="gesture-panel__toggle">
                <input
                  type="checkbox"
                  checked={gestureEnabled}
                  onChange={(e) => setGestureEnabled(e.target.checked)}
                />
                <span>MEDIAPIPE</span>
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
          </aside>
        </main>
      </div>
      {instructionsOpen && (
        <div className="modal-bg" role="presentation" onClick={() => setInstructionsOpen(false)}>
          <section
            className="instructions-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructions-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-panel-title" id="instructions-title">
              INSTRUCTIONS
            </div>
            <div className="instructions-modal__body">
              <p>Draw the prompt on the canvas before the round ends.</p>
              <ul>
                <li>Use the pencil to draw and the eraser to remove marks.</li>
                <li>Pick a color and brush size from the toolbar.</li>
                <li>Undo, redo, or clear when you need to reset.</li>
                <li>Gesture mode lets MediaPipe control drawing when a hand is detected.</li>
              </ul>
              <button
                type="button"
                className="px-btn"
                onClick={() => setInstructionsOpen(false)}
                autoFocus
              >
                CLOSE
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

export default App
