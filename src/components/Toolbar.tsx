import { MAX_BRUSH_SIZE, MIN_BRUSH_SIZE } from '../utils/constants'
import type { ToolMode } from '../types/drawing'

export interface ToolbarProps {
  mode: ToolMode
  onModeChange: (mode: ToolMode) => void
  color: string
  onColorChange: (color: string) => void
  brushSize: number
  onBrushSizeChange: (size: number) => void
  onClear: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  disabled?: boolean
}

function IconPencil() {
  return (
    <svg className="toolbar__svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  )
}

function IconEraser() {
  return (
    <svg className="toolbar__svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M16.24 3.56 20.44 7.75a1.5 1.5 0 0 1 0 2.12l-8.49 8.49a2 2 0 0 1-1.41.59H5v-4.54a2 2 0 0 1 .59-1.41l8.49-8.49a1.5 1.5 0 0 1 2.16 0zM4 20h12v2H4z"
      />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg className="toolbar__svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  )
}

function IconUndo() {
  return (
    <svg className="toolbar__svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"
      />
    </svg>
  )
}

function IconRedo() {
  return (
    <svg className="toolbar__svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"
      />
    </svg>
  )
}

export function Toolbar({
  mode,
  onModeChange,
  color,
  onColorChange,
  brushSize,
  onBrushSizeChange,
  onClear,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  disabled = false,
}: ToolbarProps) {
  return (
    <div className="toolbar-stack">
      <div className="toolbar" role="toolbar" aria-label="Canvas tools">
        <button
          type="button"
          className={`toolbar__btn toolbar__btn--primary${mode === 'draw' ? ' toolbar__btn--active' : ''}`}
          onClick={() => onModeChange('draw')}
          aria-pressed={mode === 'draw'}
          title="Draw"
          disabled={disabled}
        >
          <IconPencil />
          {mode === 'draw' && <span className="toolbar__badge" title="Active" />}
        </button>
        <button
          type="button"
          className={`toolbar__btn${mode === 'erase' ? ' toolbar__btn--active' : ''}`}
          onClick={() => onModeChange('erase')}
          aria-pressed={mode === 'erase'}
          title="Erase"
          disabled={disabled}
        >
          <IconEraser />
          {mode === 'erase' && <span className="toolbar__badge toolbar__badge--muted" title="Active" />}
        </button>

        <span className="toolbar__divider" aria-hidden />

        <button
          type="button"
          className="toolbar__btn"
          onClick={onUndo}
          disabled={disabled || !canUndo}
          title="Undo"
          aria-label="Undo"
        >
          <IconUndo />
        </button>
        <button
          type="button"
          className="toolbar__btn"
          onClick={onRedo}
          disabled={disabled || !canRedo}
          title="Redo"
          aria-label="Redo"
        >
          <IconRedo />
        </button>

        <span className="toolbar__divider" aria-hidden />

        <button type="button" className="toolbar__btn" onClick={onClear} title="Clear canvas" disabled={disabled}>
          <IconTrash />
        </button>
      </div>

      <div className="toolbar toolbar--secondary" aria-label="Brush settings">
        <label className="toolbar__label">
          <span className="toolbar__label-text">Color</span>
          <input
            type="color"
            className="toolbar__color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            title="Brush color"
            aria-label="Brush color"
            disabled={disabled}
          />
        </label>
        <label className="toolbar__label toolbar__label--grow">
          <span className="toolbar__label-text">Size {brushSize}px</span>
          <input
            type="range"
            className="toolbar__range"
            min={MIN_BRUSH_SIZE}
            max={MAX_BRUSH_SIZE}
            value={brushSize}
            onChange={(e) => onBrushSizeChange(Number(e.target.value))}
            aria-label="Brush size"
            disabled={disabled}
          />
        </label>
      </div>
    </div>
  )
}
