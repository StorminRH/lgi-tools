'use client';

// The dashboard's terminal-style search hint (handoff §5). A bare line — no box,
// no second search engine — that types itself in once, idles with a blinking
// green cursor, and reveals a ⌘K kbd hint when done. The whole line is a button
// that focuses the existing nav search (the only search), by its
// `data-search-input` contract. Under reduced motion the text is shown at once
// and the cursor doesn't blink (the keyframe is gated off in globals.css).
import { useEffect, useMemo, useState } from 'react';

const HINT = 'search for any blueprint or reaction to get started';
const STEP_MS = 26;

function focusNavSearch() {
  const input = document.querySelector<HTMLInputElement>('[data-search-input]');
  if (!input) return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  input.focus();
}

export function IndustryTypedHint() {
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [shown, setShown] = useState(reduced ? HINT.length : 0);

  useEffect(() => {
    if (reduced) return;
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
    <button type="button" className="industry-hint" onClick={focusNavSearch}>
      <span className="pr">{'>'}</span>
      <span className="txt">{HINT.slice(0, shown)}</span>
      <span className="cur" aria-hidden="true" />
      <kbd className={done ? 'show' : undefined}>⌘K</kbd>
    </button>
  );
}
