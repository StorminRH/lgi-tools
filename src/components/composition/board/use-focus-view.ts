'use client';

import { useSearchParams } from 'next/navigation';
import {
  addTransitionType,
  type RefObject,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type BoardView, boardTransitionType, boardViewHref, characterParam, OVERVIEW } from './board-view-model';

// Marks the history entry a character was focused from the overview, so going
// back steps back to it instead of stacking a new overview entry on top.
const FOCUSED_FROM_OVERVIEW = 'lgiBoardFocused';

function focusedFromOverview(): boolean {
  const state: unknown = window.history.state;
  return typeof state === 'object' && state !== null && FOCUSED_FROM_OVERVIEW in state;
}

function writeView(view: BoardView): void {
  const href = boardViewHref(window.location.pathname, window.location.search, view);
  if (view.view === 'character') window.history.pushState({ [FOCUSED_FROM_OVERVIEW]: true }, '', href);
  else window.history.replaceState(null, '', href);
}

const urlParam = () => characterParam(new URLSearchParams(window.location.search));

export interface FocusView {
  view: BoardView;
  open: (characterId: number) => void;
  toOverview: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  backRef: RefObject<HTMLButtonElement | null>;
}

/**
 * An overview of characters that opens one of them at a time, as the home
 * board does. The view lives in `?character=`: pushState keeps Back and
 * Forward inside the page, and useSearchParams seeds the first render so a
 * reload opens the same view. The view itself is local state set in
 * startTransition, because Next's history sync commits outside the transition
 * and <ViewTransition> never ran. `resolve` turns the parameter into a view
 * and must be stable between renders; `tileAttribute` names the data
 * attribute on each overview tile, so closing a character refocuses its tile.
 */
export function useFocusView(resolve: (param: string | null) => BoardView, tileAttribute: string): FocusView {
  const params = useSearchParams();
  const [param, setParam] = useState(() => characterParam(params));
  const view = resolve(param);
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const lastOpened = useRef<number | null>(view.view === 'character' ? view.characterId : null);

  const show = useCallback(
    (next: string | null) => {
      startTransition(() => {
        addTransitionType(boardTransitionType(resolve(next)));
        setParam(next);
      });
    },
    [resolve],
  );

  // Reconcile history navigation after Next updates the URL. Starting this
  // transition inside popstate makes React skip the animation for restoration.
  const searchParam = characterParam(params);
  useEffect(() => {
    if (searchParam !== param) show(searchParam);
  }, [searchParam, param, show]);

  const toOverview = useCallback(() => {
    if (urlParam() === null) return;
    if (focusedFromOverview()) {
      window.history.back();
      return;
    }
    writeView(OVERVIEW);
    show(null);
  }, [show]);

  const open = useCallback(
    (characterId: number) => {
      lastOpened.current = characterId;
      writeView({ view: 'character', characterId });
      show(String(characterId));
    },
    [show],
  );

  // On the always-mounted board, not on the sheet: an Escape pressed while
  // the sheet is still animating in was missed when the sheet owned it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // An open drawer or dialog owns Escape: it closes first, the sheet stays.
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[data-drawer-popup], [role="dialog"]') !== null) return;
      toOverview();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [toOverview]);

  const shownId = view.view === 'character' ? view.characterId : null;
  const shownBefore = useRef(shownId);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null || shownBefore.current === shownId) return;
    shownBefore.current = shownId;
    if (root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: 'start' });
    if (shownId !== null) {
      lastOpened.current = shownId;
      backRef.current?.focus({ preventScroll: true });
    } else if (lastOpened.current !== null) {
      root.querySelector<HTMLElement>(`[${tileAttribute}="${lastOpened.current}"]`)?.focus({ preventScroll: true });
    }
  }, [shownId, tileAttribute]);

  return { view, open, toOverview, rootRef, backRef };
}
