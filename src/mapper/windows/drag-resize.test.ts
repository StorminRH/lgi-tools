import { describe, expect, it, vi } from 'vitest';
import { createPointerGesture } from './drag-resize';

class PointerTarget extends EventTarget {
  captured: number | null = null;
  setPointerCapture(pointerId: number): void {
    this.captured = pointerId;
  }
  releasePointerCapture(pointerId: number): void {
    if (this.captured === pointerId) this.captured = null;
  }
  hasPointerCapture(pointerId: number): boolean {
    return this.captured === pointerId;
  }
}

function pointer(type: string, pointerId: number, clientX: number, clientY: number): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  return event;
}

describe('pointer gesture', () => {
  it('captures, streams deltas, and commits on pointer up', () => {
    const target = new PointerTarget();
    const onDelta = vi.fn();
    const onEnd = vi.fn();
    const gesture = createPointerGesture({ onDelta, onEnd });

    gesture.onPointerDown({
      pointerId: 7,
      clientX: 10,
      clientY: 20,
      currentTarget: target,
      preventDefault: vi.fn(),
    });
    target.dispatchEvent(pointer('pointermove', 7, 14, 27));
    target.dispatchEvent(pointer('pointerup', 7, 15, 29));

    expect(onDelta.mock.calls).toEqual([[{ x: 4, y: 7 }], [{ x: 1, y: 2 }]]);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(target.captured).toBeNull();
  });

  it('commits cancellation but disposal aborts without committing', () => {
    const target = new PointerTarget();
    const onEnd = vi.fn();
    const gesture = createPointerGesture({ onDelta: vi.fn(), onEnd });

    gesture.onPointerDown({
      pointerId: 2,
      clientX: 0,
      clientY: 0,
      currentTarget: target,
      preventDefault: vi.fn(),
    });
    target.dispatchEvent(pointer('pointercancel', 2, 0, 0));
    expect(onEnd).toHaveBeenCalledTimes(1);

    gesture.onPointerDown({
      pointerId: 3,
      clientX: 0,
      clientY: 0,
      currentTarget: target,
      preventDefault: vi.fn(),
    });
    gesture.dispose();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(target.captured).toBeNull();
  });
});
