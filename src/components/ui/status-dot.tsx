import { cn } from './cn';

// The pulsing status LED — the single seam to the `.status-led` idiom defined in
// globals.css: a green pulse for 'online', a static amber for 'vip', a static
// muted dot for 'offline'. The CSS already honors prefers-reduced-motion (it
// drops the animation). Both the Tranquility server chip (ServerStatus) and the
// character-portrait online dot render through this one primitive, so the LED
// look lives in exactly one place. Decorative — aria-hidden; the meaning is
// carried by adjacent text/alt where it matters (a11y verification deferred,
// OOB.2.3).
export type StatusDotState = 'online' | 'offline' | 'vip';

export function StatusDot({ state, className }: { state: StatusDotState; className?: string }) {
  return <span aria-hidden className={cn('status-led', state, className)} />;
}
