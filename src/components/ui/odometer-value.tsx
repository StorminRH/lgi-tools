'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';

// A live ISK figure rendered as a mechanical odometer: each digit is a 0–9
// strip that slides vertically to its value whenever the figure changes (e.g.
// when a live price lands). Non-digit characters (the decimal point, the B/M/K
// scale, "ISK", a sign, a percentage) stay static. While a price is still being
// fetched the whole figure dims.
//
// CSP-clean: the per-column offset is a `--digit` custom property set via
// ref.style.setProperty (never an inline `style=` attribute, which the
// production CSP drops); the slide itself is a stylesheet transition
// (`.odo-strip` in globals.css). Accessible: the animated strips are
// aria-hidden and the real value is exposed once via an sr-only span, so a
// screen reader reads "123.4M ISK", not ten stacked 0–9 ladders.

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

interface Cell {
  digit: number | null; // a 0–9 strip when set; otherwise a static character
  char: string;
}

// Split a formatted figure into renderable cells: each numeral becomes a
// sliding strip, every other character (".", "M", " ", "%", "+", "—", …) is
// kept verbatim, with spaces rendered as non-breaking so an inline-flex row
// doesn't collapse the gap (the gotcha the sandbox hit).
export function toOdometerCells(value: string): Cell[] {
  return [...value].map((char) =>
    /\d/.test(char) ? { digit: Number(char), char } : { digit: null, char: char === ' ' ? ' ' : char },
  );
}

function OdoDigit({ digit }: { digit: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (first.current) {
      // First commit: jump straight to the starting digit with the slide
      // disabled, so figures don't all roll up from zero on load/navigation
      // (the slide is for genuine value changes). The forced reflow commits the
      // jump before the transition is re-enabled for subsequent updates.
      first.current = false;
      el.classList.add('odo-strip--init');
      el.style.setProperty('--digit', String(digit));
      void el.offsetWidth;
      el.classList.remove('odo-strip--init');
    } else {
      el.style.setProperty('--digit', String(digit));
    }
  }, [digit]);
  return (
    <span className="odo-col">
      <span ref={ref} className="odo-strip">
        {DIGITS.map((n) => (
          <span key={n} className="block h-[1em]">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

export function OdometerValue({
  value,
  pending = false,
  className,
}: {
  value: string;
  pending?: boolean;
  className?: string;
}) {
  // The server and first client paint render the value as plain text, so the
  // static shell shows the real figure (not strips stuck at zero, since the
  // per-digit offset is only set in a post-mount effect). After mount we swap to
  // sliding strips — seamlessly, because each strip jumps to its value on first
  // commit. The set is deferred (0ms) to satisfy the set-state-in-effect lint.
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <span className={cn(pending && 'opacity-60', className)}>
      <span className="sr-only">{value}</span>
      <span className="inline-flex items-baseline tabular-nums" aria-hidden>
        {animate
          ? toOdometerCells(value).map((cell, i) =>
              cell.digit === null ? (
                <span key={i}>{cell.char}</span>
              ) : (
                <OdoDigit key={i} digit={cell.digit} />
              ),
            )
          : value}
      </span>
    </span>
  );
}
