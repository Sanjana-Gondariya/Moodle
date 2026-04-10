import type { DrawingEngine, GestureInputEvent } from '../types/drawing'

/**
 * Maps normalized gesture packets → drawing engine calls.
 * Pointer, touch, and MediaPipe hooks produce `GestureInputEvent` and call this.
 * On `start`, `gesture.mode` selects draw vs erase for that stroke (toolbar is overridden when set).
 */
export function applyGestureInput(engine: DrawingEngine, gesture: GestureInputEvent): void {
  switch (gesture.action) {
    case 'start':
      engine.startStroke(gesture.x, gesture.y, gesture.mode)
      break
    case 'move':
      engine.continueStroke(gesture.x, gesture.y)
      break
    case 'end':
      engine.endStroke()
      break
    case 'idle':
      break
  }
}
