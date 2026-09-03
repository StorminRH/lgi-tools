'use client';

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

export function IndustryTypedHint() {
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [shown, setShown] = useState(reduced ? HINT.length : 0);

  useEffect(() => {

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
