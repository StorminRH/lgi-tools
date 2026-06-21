'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// The single sitewide "something dynamic is loading" affordance: a terminal
// strip that drops from under the nav bar while ANY live surface is fetching,
// loops a few terminal lines, then prints "> ok." and retracts. One instance,
// mounted once by LoadingToastProvider in the root layout.
//
// Trigger contract: surfaces don't render their own toast — they register with
// the shared provider via useLoadingToast(active). The provider holds a Set of
// opaque tokens and shows the toast while the set is non-empty; a token-set (not
// an integer counter) is idempotent under React's double-mounted effects and
// unmount-during-flight, so concurrent loaders can't desync the count. The hook
// suits any component that already holds a boolean flag (Convex `syncing`, the
// planner's `refreshing`): it acquires a token on true/mount and releases on
// false/unmount. (A Suspense-fallback variant that registers for a streamed
// segment's pending window is a trivial wrapper — add it when a hole needs one.)
//
// CSP-clean: the slide is a [data-open] stylesheet rule (globals.css), never an
// inline style. State sharing is Context-only, matching AuthProvider /
// PricingProvider / SiteLiveProvider.

interface LoadingToastContextValue {
  acquire: (token: string) => void;
  release: (token: string) => void;
}

const LoadingToastContext = createContext<LoadingToastContextValue | null>(null);

export function LoadingToastProvider({ children }: { children: ReactNode }) {
  // The live registration set, mutated synchronously in acquire/release; the
  // render only cares whether it's non-empty, so we publish the size as state.
  const tokens = useRef<Set<string>>(new Set());
  const [count, setCount] = useState(0);

  const acquire = useCallback((token: string) => {
    tokens.current.add(token);
    setCount(tokens.current.size);
  }, []);

  const release = useCallback((token: string) => {
    tokens.current.delete(token);
    setCount(tokens.current.size);
  }, []);

  const ctx = useMemo<LoadingToastContextValue>(
    () => ({ acquire, release }),
    [acquire, release],
  );

  return (
    <LoadingToastContext.Provider value={ctx}>
      {children}
      <LoadingToast active={count > 0} />
    </LoadingToastContext.Provider>
  );
}

// Register a loader for as long as `active` is true (and until unmount). The
// canonical entry point for components that already hold a boolean flag. No-op
// on the server (the effect doesn't run) and a no-op outside a provider (ctx is
// null), so a beacon in a test or storybook can't throw. useId gives a stable,
// instance-unique token without a useRef(randomUUID) dance.
export function useLoadingToast(active: boolean): void {
  const ctx = useContext(LoadingToastContext);
  const token = useId();
  useEffect(() => {
    if (!ctx || !active) return;
    ctx.acquire(token);
    return () => ctx.release(token);
  }, [ctx, active, token]);
}

const SHOW_DELAY_MS = 120; // debounce: a sub-blip load never shows the toast
const MIN_VISIBLE_MS = 800; // once shown, stay up long enough to read + close
const OK_HOLD_MS = 520; // how long "> ok." shows before retracting
const LINE_INTERVAL_MS = 1100; // cadence of the looping lines
const SLIDE_MS = 260; // must match the .loading-toast-panel transform transition (globals.css)

const LOOP_LINES = [
  '> fetching market orders…',
  '> consulting ESI gate…',
  '> reconciling order book…',
] as const;
const OK_LINE = '> ok.';
const REDUCED_LINE = '> loading…';

// 'hidden' → not mounted; 'looping' → mounted, rotating lines while a loader is
// held; 'closing' → mounted, printing "> ok." then sliding out.
type Phase = 'hidden' | 'looping' | 'closing';

// Private view — the one toast instance. Driven solely by `active` (whether any
// loader is registered); owns the anti-flicker timing AND the enter/exit slide.
// `phase` gates mount + content; a separate `open` boolean drives the [data-open]
// slide, decoupled from mount so the transform transition can play in BOTH
// directions — a CSS transition never fires on the frame an element is created,
// and React can't delay an unmount for one. So the panel mounts closed then
// flips open (slide in), and flips closed then unmounts after the slide (out).
function LoadingToast({ active }: { active: boolean }) {
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const [phase, setPhase] = useState<Phase>('hidden');
  const [open, setOpen] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const shownAt = useRef(0);

  // Show-debounce + min-visible state machine. Every setState lives in a timer
  // callback (never synchronously in the effect body) so the set-state-in-effect
  // lint stays quiet and renders don't cascade.
  useEffect(() => {
    if (active) {
      if (phase === 'hidden') {
        const t = setTimeout(() => {
          shownAt.current = Date.now();
          setLineIndex(0);
          setPhase('looping');
        }, SHOW_DELAY_MS);
        return () => clearTimeout(t);
      }
      if (phase === 'closing') {
        // A new load arrived mid-retract → reopen instead of dismissing.
        const t = setTimeout(() => {
          setPhase('looping');
          setOpen(true);
        }, 0);
        return () => clearTimeout(t);
      }
      return;
    }
    if (phase === 'looping') {
      const elapsed = Date.now() - shownAt.current;
      const t = setTimeout(
        () => setPhase('closing'),
        Math.max(0, MIN_VISIBLE_MS - elapsed),
      );
      return () => clearTimeout(t);
    }
  }, [active, phase]);

  // Enter slide: the panel mounts closed (translateY(-100%), clipped above the
  // nav) then flips open on a later frame so the transform transition plays it
  // down into view. The double rAF guarantees the closed state paints first;
  // under reduced motion the slide is a no-op, so just open it.
  useEffect(() => {
    if (phase !== 'looping') return;
    if (reduced) {
      const t = setTimeout(() => setOpen(true), 0);
      return () => clearTimeout(t);
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setOpen(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [phase, reduced]);

  // Rotate the looping lines (skipped under reduced motion → static line).
  useEffect(() => {
    if (phase !== 'looping' || reduced) return;
    const id = setInterval(
      () => setLineIndex((i) => (i + 1) % LOOP_LINES.length),
      LINE_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [phase, reduced]);

  // Close sequence: hold "> ok." briefly, then flip closed (slide out), then
  // unmount once the slide has played. Reduced motion collapses both delays.
  useEffect(() => {
    if (phase !== 'closing') return;
    let unmount: ReturnType<typeof setTimeout> | undefined;
    const hold = setTimeout(
      () => {
        setOpen(false);
        unmount = setTimeout(() => setPhase('hidden'), reduced ? 0 : SLIDE_MS);
      },
      reduced ? 0 : OK_HOLD_MS,
    );
    return () => {
      clearTimeout(hold);
      if (unmount) clearTimeout(unmount);
    };
  }, [phase, reduced]);

  if (phase === 'hidden') return null;

  const line =
    phase === 'closing' ? OK_LINE : reduced ? REDUCED_LINE : LOOP_LINES[lineIndex];

  // Decorative chrome: every live surface still shows its own loading state
  // (the panels' "Syncing from ESI…", the planner's "Calculating…"), so the
  // toast is aria-hidden — no double-announce, no aria-live spam. The clip
  // wrapper sits flush under the 50px nav (AppHeader's h-[50px]); the panel
  // slides within it via [data-open]. z-40: above page + dropdown/feedback
  // (z-30), below hover-popovers (z-50).
  return (
    <div
      className="fixed inset-x-0 top-[50px] z-40 overflow-hidden"
      aria-hidden="true"
    >
      <div
        data-open={open ? 'true' : 'false'}
        className="loading-toast-panel border-b border-border bg-bg-deep px-4 py-1.5 font-mono text-[11px] tracking-[0.04em] text-isk"
      >
        {line}
      </div>
    </div>
  );
}
