import { STILL_WORMHOLE, stepWormholeMotion, wormholeNeedsFrame } from './motion';
import { acquireWormholePainter } from './painter';
import { wormholePalette, wormholeSeed, type WormholeShipSize } from './palette';

export interface WormholeInputs {
  readonly whClassId?: number | null;
  readonly active: boolean;
  readonly paused?: boolean;
  readonly seed?: string;
  readonly size?: number;
  readonly shipSize?: WormholeShipSize;
}

function applyAppearance(canvas: HTMLCanvasElement, inputs: WormholeInputs) {
  const requested = inputs.size;
  const size = requested !== undefined && Number.isFinite(requested)
    ? Math.min(512, Math.max(32, requested))
    : 75;
  const backing = Math.min(256, Math.round(size * Math.min(2, window.devicePixelRatio || 1)));
  if (canvas.width !== backing || canvas.height !== backing) {
    canvas.width = canvas.height = backing;
  }
  const palette = wormholePalette(inputs.whClassId, inputs.shipSize);
  const wrapper = canvas.parentElement;
  wrapper?.style.setProperty('--wormhole-size', `${size}px`);
  for (const key of ['core', 'accent', 'halo', 'dark'] as const) {
    const rgb = palette[key].map((value) => Math.round(value * 255)).join(' ');
    wrapper?.style.setProperty(`--wormhole-${key}`, `rgb(${rgb})`);
  }
  return { palette, seed: wormholeSeed(inputs.seed ?? '') };
}

/** Owns browser resources; never schedules frames for an idle/offscreen node. */
export function createWormholeHost(canvas: HTMLCanvasElement, initial: WormholeInputs) {
  const painter = acquireWormholePainter();
  const context = canvas.getContext('2d');
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let inputs = initial;
  let appearance = applyAppearance(canvas, inputs);
  let motion = STILL_WORMHOLE;
  let visible = false;
  let destroyed = false;
  let frame = 0;
  let last = 0;

  function paused() { return inputs.paused === true || media.matches || document.hidden || !visible; }
  function paint() {
    if (context === null) return false;
    const ready = painter.paint(context, { ...appearance, time: motion.time, age: motion.age });
    if (ready) {
      canvas.dataset.ready = 'true';
      return true;
    }
    if (canvas.dataset.ready !== 'true') {
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.dataset.ready = 'false';
    }
    return false;
  }
  function cancel() { window.cancelAnimationFrame(frame); frame = 0; }
  function tick(now: number) {
    frame = 0;
    if (destroyed || paused()) return;
    motion = stepWormholeMotion(motion, (now - last) / 1000, inputs.active, false);
    last = now;
    if (paint() && wormholeNeedsFrame(motion)) frame = window.requestAnimationFrame(tick);
  }
  function synchronize() {
    cancel();
    motion = stepWormholeMotion(motion, 0, inputs.active, paused());
    if (!visible || document.hidden || destroyed) return;
    const ready = paint();
    if (ready && !paused() && wormholeNeedsFrame(motion)) {
      last = performance.now();
      frame = window.requestAnimationFrame(tick);
    }
  }
  const observer = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? false;
    synchronize();
  });
  observer.observe(canvas);
  media.addEventListener('change', synchronize);
  document.addEventListener('visibilitychange', synchronize);

  return {
    update(next: WormholeInputs) {
      inputs = { ...inputs, ...next };
      appearance = applyAppearance(canvas, inputs);
      synchronize();
    },
    dispose() {
      destroyed = true;
      cancel();
      observer.disconnect();
      media.removeEventListener('change', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
      painter.release();
    },
  };
}
