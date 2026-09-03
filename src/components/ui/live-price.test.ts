import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  LivePrice,
  livePriceTransition,
  scheduleConfirmFlash,
  type ConfirmFlashHost,
} from './live-price';

function createRafQueue() {
  let nextId = 1;
  const pending: Array<{ id: number; callback: FrameRequestCallback }> = [];
  return {
    requestAnimationFrame(callback: FrameRequestCallback) {
      const id = nextId;
      nextId += 1;
      pending.push({ id, callback });
      return id;
    },
    cancelAnimationFrame(handle: number) {
      const index = pending.findIndex((entry) => entry.id === handle);
      if (index >= 0) pending.splice(index, 1);
    },
    flush() {
      const batch = pending.splice(0, pending.length);
      for (const entry of batch) entry.callback(0);
    },
  };
}

function createFlashHost(): ConfirmFlashHost & {
  classes: Set<string>;
  dispatchAnimationEnd: (animationName: string, targetSelf?: boolean) => void;
} {
  const classes = new Set<string>();
  const listeners = new Set<(event: AnimationEvent) => void>();
  const host: ConfirmFlashHost & {
    classes: Set<string>;
    dispatchAnimationEnd: (animationName: string, targetSelf?: boolean) => void;
  } = {
    classes,
    classList: {
      add(token: string) {
        classes.add(token);
      },
      remove(token: string) {
        classes.delete(token);
      },
    },
    offsetWidth: 1,
    addEventListener(_type: 'animationend', listener: (event: AnimationEvent) => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: 'animationend', listener: (event: AnimationEvent) => void) {
      listeners.delete(listener);
    },
    dispatchAnimationEnd(animationName: string, targetSelf = true) {
      const event = {
        type: 'animationend',
        animationName,
        target: targetSelf ? host : {},
        currentTarget: host,
      } as unknown as AnimationEvent;
      for (const listener of [...listeners]) listener(event);
    },
  };
  return host;
}

describe('LivePrice', () => {
  it('marks the in-progress seed without treating first mount as an update', () => {
    const html = renderToStaticMarkup(createElement(LivePrice, { value: '12.4M ISK', pending: true }));
    expect(html).toContain('data-price-state="pending"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('price-live');
    expect(html).toContain('price-pending');
    expect(html).not.toContain('price-flash');
    expect(livePriceTransition(null, { value: '12.4M ISK', pending: true })).toBe('none');
  });

  it('replays confirmation when pending settles even if the value is unchanged', () => {
    expect(
      livePriceTransition(
        { value: '12.4M ISK', pending: true },
        { value: '12.4M ISK', pending: false },
      ),
    ).toBe('confirm');
  });

  it('does not flash a settled initial mount and does replay a later value change', () => {
    expect(livePriceTransition(null, { value: '12.4M ISK', pending: false })).toBe('none');
    expect(
      livePriceTransition(
        { value: '12.4M ISK', pending: false },
        { value: '12.8M ISK', pending: false },
      ),
    ).toBe('confirm');
  });

});

describe('scheduleConfirmFlash', () => {
  it('arms price-flash after two frames and clears it on animationend', () => {
    const host = createFlashHost();
    const raf = createRafQueue();
    const flash = scheduleConfirmFlash(host, {
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      prefersReducedMotion: () => false,
    });

    expect(flash.isArmed()).toBe(false);
    expect(host.classes.has('price-flash')).toBe(false);

    raf.flush();
    expect(flash.isArmed()).toBe(false);
    raf.flush();
    expect(flash.isArmed()).toBe(true);
    expect(host.classes.has('price-flash')).toBe(true);

    host.dispatchAnimationEnd('price-flash');
    expect(host.classes.has('price-flash')).toBe(false);
  });

  it('cancels an unarmed flash so Strict Mode cleanup leaves no class', () => {
    const host = createFlashHost();
    const raf = createRafQueue();
    const flash = scheduleConfirmFlash(host, {
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      prefersReducedMotion: () => false,
    });

    flash.cleanup();
    raf.flush();
    raf.flush();
    expect(flash.isArmed()).toBe(false);
    expect(host.classes.has('price-flash')).toBe(false);
  });

  it('marks armed under reduced motion without applying the flash class', () => {
    const host = createFlashHost();
    const raf = createRafQueue();
    const flash = scheduleConfirmFlash(host, {
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      prefersReducedMotion: () => true,
    });

    raf.flush();
    raf.flush();
    expect(flash.isArmed()).toBe(true);
    expect(host.classes.has('price-flash')).toBe(false);
  });

  it('ignores animationend events from other names or targets', () => {
    const host = createFlashHost();
    const raf = createRafQueue();
    scheduleConfirmFlash(host, {
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      prefersReducedMotion: () => false,
    });
    raf.flush();
    raf.flush();
    expect(host.classes.has('price-flash')).toBe(true);

    host.dispatchAnimationEnd('price-pending');
    expect(host.classes.has('price-flash')).toBe(true);
    host.dispatchAnimationEnd('price-flash', false);
    expect(host.classes.has('price-flash')).toBe(true);
  });

  it('does not Illegal-invocation when window-like rAF requires its receiver', () => {

    const windowLike = {
      requestAnimationFrame(this: unknown, callback: FrameRequestCallback) {
        if (this !== windowLike) throw new TypeError('Illegal invocation');
        callback(0);
        return 1;
      },
      cancelAnimationFrame(this: unknown, _handle: number) {
        if (this !== windowLike) throw new TypeError('Illegal invocation');
      },
      matchMedia() {
        return { matches: false };
      },
    };
    const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: windowLike,
    });
    try {
      const host = createFlashHost();
      const bound: Parameters<typeof scheduleConfirmFlash>[1] = {
        requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
        cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
        prefersReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
      expect(() => scheduleConfirmFlash(host, bound)).not.toThrow();
      expect(host.classes.has('price-flash')).toBe(true);

      expect(() =>
        scheduleConfirmFlash(host, {
          requestAnimationFrame: windowLike.requestAnimationFrame,
          cancelAnimationFrame: windowLike.cancelAnimationFrame,
          prefersReducedMotion: () => false,
        }),
      ).toThrow(/Illegal invocation/);
    } finally {
      if (previousDescriptor) {
        Object.defineProperty(globalThis, 'window', previousDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});
