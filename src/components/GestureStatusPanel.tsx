import type { GestureControllerStatus } from '../types/drawing'

export interface GestureStatusPanelProps {
  webcamReady: boolean
  mediaPipeReady: boolean
  error: string | null
  status: GestureControllerStatus
  currentToolMode: 'draw' | 'erase'
}

function Dot({ ok }: { ok: boolean }) {
  return <span className={`status-dot${ok ? ' status-dot--ok' : ''}`} aria-hidden />
}

export function GestureStatusPanel({
  webcamReady,
  mediaPipeReady,
  error,
  status,
  currentToolMode,
}: GestureStatusPanelProps) {
  return (
    <aside className="gesture-status" aria-live="polite">
      <h3 className="gesture-status__title">Gesture Status</h3>
      <div className="gesture-status__grid">
        <div>
          <Dot ok={webcamReady} /> Webcam: {webcamReady ? 'ready' : 'loading'}
        </div>
        <div>
          <Dot ok={mediaPipeReady} /> MediaPipe: {mediaPipeReady ? 'ready' : 'loading'}
        </div>
        <div>
          <Dot ok={status.handDetected} /> Hand: {status.handDetected ? 'detected' : 'not detected'}
        </div>
        <div>
          <Dot ok={status.pinchActive} /> Pinch: {status.pinchActive ? 'active' : 'idle'}
        </div>
        <div>
          <Dot ok={status.drawingActive} /> Drawing: {status.drawingActive ? 'active' : 'idle'}
        </div>
        <div>Gesture: {status.gesture}</div>
        <div>
          Gesture tool: {status.gestureToolMode} (index+middle → erase / apart → draw)
        </div>
        <div>Toolbar tool: {currentToolMode}</div>
        <div>Input mode: {status.inputMode}</div>
        <div>
          Cursor: {status.cursor ? `${Math.round(status.cursor.x)}, ${Math.round(status.cursor.y)}` : '--'}
        </div>
      </div>
      <div className="gesture-status__clear-hold" aria-live="polite">
        <strong>Clear (open palm 7s)</strong>
        <p className="gesture-status__clear-msg">{status.clearHold.message}</p>
        {(status.clearHold.phase === 'clear_gesture_detected' ||
          status.clearHold.phase === 'holding_to_clear') && (
          <p className="gesture-status__clear-progress">
            Progress: {Math.round(status.clearHold.progress01 * 100)}% — ~{status.clearHold.secondsRemaining}s
            left
          </p>
        )}
      </div>
      {status.trackingLost && <p className="gesture-status__warn">Tracking lost; stroke safely ended.</p>}
      {error && <p className="gesture-status__error">Error: {error}</p>}
    </aside>
  )
}
