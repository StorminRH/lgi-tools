'use client';

// The dashboard's terminal-style search hint (handoff §5). A bare line — no box,
// no second search engine — that types itself in once, idles with a blinking
// green cursor, and reveals a ⌘K kbd hint when done. The whole line is a button
// that focuses the existing nav search (the only search), by its
// `data-search-input` contract. Under reduced motion the text is shown at once
// and the cursor doesn't blink (the keyframe is gated off in globals.css).
import { useEffect, useMemo, useState } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { Button } from '@/components/ui/button';

const HINT = 'search for any blueprint or reaction to get started';
const STEP_MS = 26;

function focusNavSearch() {
  const input = document.querySelector<HTMLInputElement>('[data-search-input]');
  if (!input) return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  input.focus();
}

/** Renders the planner's typed explanatory hint with consistent terminal styling. */
export function IndustryTypedHint() {
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [shown, setShown] = useState(reduced ? HINT.length : 0);

  useEffect(() => {
    // `reduced` is read from matchMedia, which is false during SSR — so the
    // server (and the hydration render, which keeps the server-initialized
    // state) shows nothing. For a reduced-motion client we must materialise the
    // full text after mount; the useState initialiser can't (it's ignored on
    // hydration). Deferred via setTimeout(0) so it isn't a synchronous setState
    // in the effect body (the `react-hooks/set-state-in-effect` escape used
    // elsewhere, e.g. RecentlyViewed).
    if (reduced) {
      const t = setTimeout(() => setShown(HINT.length), 0);
      return () => clearTimeout(t);
    }
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= HINT.length) clearInterval(timer);
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [reduced]);

  const done = shown >= HINT.length;

  return (
    <Button
      variant="bare"
      type="button"
      className="inline-flex items-center gap-[9px] py-1 text-left font-ui text-ui tracking-[0.03em] text-muted"
      onClick={focusNavSearch}
    >
      <span className="shrink-0 text-ui font-bold text-isk">{'>'}</span>
      <span className="whitespace-normal text-text transition-colors hover:text-name sm:whitespace-nowrap">{HINT.slice(0, shown)}</span>
      <span className="industry-cur h-3.5 w-[7px] shrink-0 bg-isk" aria-hidden="true" />
      <Kbd
        className={
          `tracking-wide uppercase transition-opacity duration-fast motion-reduce:transition-none ${done ? 'opacity-100' : 'opacity-0'}`
        }
      >
        ⌘K
      </Kbd>
    </Button>
  );
}
