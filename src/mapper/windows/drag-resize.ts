/** One pointer delta emitted by the shared capture gesture. */
export interface PointerDelta {
  readonly x: number;
  readonly y: number;
}

interface PointerCaptureTarget extends EventTarget {
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
  hasPointerCapture(pointerId: number): boolean;
}

/** The browser and React pointer-event fields the gesture engine needs. */
export interface GesturePointerEvent {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly currentTarget: PointerCaptureTarget;
  preventDefault(): void;
}

/** One capture-based gesture shared by window drag and resize; dispose aborts without committing. */
export function createPointerGesture(callbacks: {
  readonly onDelta: (delta: PointerDelta) => void;
  readonly onEnd: () => void;
}): {
  readonly onPointerDown: (event: GesturePointerEvent) => void;
  readonly dispose: () => void;
} {
  let active:
    | {
        readonly pointerId: number;
        readonly target: PointerCaptureTarget;
        x: number;
        y: number;
      }
    | null = null;

  const removeListeners = (gesture: NonNullable<typeof active>) => {
    gesture.target.removeEventListener('pointermove', onPointerMove);
    gesture.target.removeEventListener('pointerup', onPointerEnd);
    gesture.target.removeEventListener('pointercancel', onPointerEnd);
    if (gesture.target.hasPointerCapture(gesture.pointerId)) {
      gesture.target.releasePointerCapture(gesture.pointerId);
    }
  };

  const emitDelta = (event: PointerEvent) => {
    if (active === null || event.pointerId !== active.pointerId) return;
    const delta = { x: event.clientX - active.x, y: event.clientY - active.y };
    active.x = event.clientX;
    active.y = event.clientY;
    callbacks.onDelta(delta);
  };

  function onPointerMove(event: Event): void {
    emitDelta(event as PointerEvent);
  }

  function onPointerEnd(event: Event): void {
    const pointer = event as PointerEvent;
    if (active === null || pointer.pointerId !== active.pointerId) return;
    emitDelta(pointer);
    const finished = active;
    active = null;
    removeListeners(finished);
    callbacks.onEnd();
  }

  const dispose = () => {
    if (active === null) return;
    const discarded = active;
    active = null;
    removeListeners(discarded);
  };

  const onPointerDown = (event: GesturePointerEvent) => {
    dispose();
    event.preventDefault();
    active = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.addEventListener('pointermove', onPointerMove);
    event.currentTarget.addEventListener('pointerup', onPointerEnd);
    event.currentTarget.addEventListener('pointercancel', onPointerEnd);
  };

  return { onPointerDown, dispose };
}
