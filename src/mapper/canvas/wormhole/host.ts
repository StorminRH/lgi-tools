import { securityBand } from '@/data/eve-data/security';
import { SYSTEM_DISC_SIZE } from '../disc-chrome';
import { STILL_WORMHOLE, stepWormholeMotion, wormholeNeedsFrame } from './motion';
import { acquireWormholePainter } from './painter';
import { bodyAppearance, wormholeSeed, type WormholeBody } from './palette';
import { BODY_EXTENT_RADII } from './shaders';

export interface WormholeInputs {
  readonly body: WormholeBody;
  readonly active: boolean;
  readonly paused?: boolean;
  readonly seed?: string;
}

const BODY_SIZE_PX = SYSTEM_DISC_SIZE * BODY_EXTENT_RADII;

function bodyKey(body: WormholeBody): string {
  return body.kind === 'planet'
    ? `planet:${securityBand(body.security)}`
    : `wormhole:${body.classId}:${body.effect}`;
}

function appearanceChanged(previous: WormholeInputs, next: WormholeInputs): boolean {
  return bodyKey(previous.body) !== bodyKey(next.body) || previous.seed !== next.seed;
}

function applyFrame(canvas: HTMLCanvasElement) {
  const backing = Math.min(256, Math.round(BODY_SIZE_PX * Math.min(2, window.devicePixelRatio || 1)));
  canvas.width = canvas.height = backing;
  canvas.parentElement?.style.setProperty('--wormhole-size', `${BODY_SIZE_PX}px`);
  canvas.parentElement?.style.setProperty('--wormhole-sphere', `${SYSTEM_DISC_SIZE}px`);
}

function applyAppearance(canvas: HTMLCanvasElement, inputs: WormholeInputs) {
  const style = window.getComputedStyle(canvas);
  const appearance = bodyAppearance(inputs.body, (token) => style.getPropertyValue(token));
  const wrapper = canvas.parentElement;
  const colors = { ...appearance.palette, tint: appearance.tint };
  for (const key of ['core', 'accent', 'halo', 'dark', 'tint'] as const) {
    const rgb = colors[key].map((value) => Math.round(value * 255)).join(' ');
    wrapper?.style.setProperty(`--wormhole-${key}`, `rgb(${rgb})`);
  }
  return { ...appearance, seed: wormholeSeed(inputs.seed ?? '') };
}

/** Owns browser resources; never schedules frames for an idle/offscreen node. */
export function createWormholeHost(canvas: HTMLCanvasElement, initial: WormholeInputs) {
  const painter = acquireWormholePainter();
  const context = canvas.getContext('2d');
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let inputs = initial;
  applyFrame(canvas);
  let appearance = applyAppearance(canvas, inputs);
  let motion = STILL_WORMHOLE;
  let visible = false;
  let destroyed = false;
  let frame = 0;
  let recover = 0;
  let recoverAttempts = 0;
  let last = 0;

  function paused() { return inputs.paused === true || media.matches || document.hidden || !visible; }
  function cancelRecover() { window.clearTimeout(recover); recover = 0; }
  function scheduleRecover() {
    if (recover !== 0 || destroyed || paused() || recoverAttempts >= 4) return;
    recoverAttempts += 1;
    recover = window.setTimeout(() => {
      recover = 0;
      synchronize();
    }, 1000);
  }
  function paint() {
    if (context === null) return false;
    const ready = painter.paint(context, {
      ...appearance,
      time: motion.time,
      age: motion.age,
      focus: motion.speed,
    });
    if (ready) {
      canvas.dataset.ready = 'true';
      recoverAttempts = 0;
      return true;
    }
    if (canvas.dataset.ready !== 'true') {
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.dataset.ready = 'false';
    } else {
      scheduleRecover();
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
    cancelRecover();
    motion = stepWormholeMotion(motion, 0, inputs.active, paused());
    if (!visible || document.hidden || destroyed) return;
    const ready = paint();
    if (ready && !paused() && wormholeNeedsFrame(motion)) {
      last = performance.now();
      frame = window.requestAnimationFrame(tick);
    }
  }
  const observer = new IntersectionObserver((entries) => {
    visible = entries.at(-1)?.isIntersecting ?? false;
    synchronize();
  });
  observer.observe(canvas);
  media.addEventListener('change', synchronize);
  document.addEventListener('visibilitychange', synchronize);

  return {
    update(next: WormholeInputs) {
      const previous = inputs;
      inputs = { ...inputs, ...next };
      if (appearanceChanged(previous, inputs)) appearance = applyAppearance(canvas, inputs);
      synchronize();
    },
    dispose() {
      destroyed = true;
      cancel();
      cancelRecover();
      observer.disconnect();
      media.removeEventListener('change', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
      painter.release();
    },
  };
}
