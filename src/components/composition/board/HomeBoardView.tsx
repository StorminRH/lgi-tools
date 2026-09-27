'use client';

import { useSearchParams } from 'next/navigation';
import {
  addTransitionType,
  startTransition,
  useCallback, useEffect, useLayoutEffect, useMemo,
  useRef,
  useState,
  ViewTransition,
} from 'react';
import { cn } from '@/components/ui/cn';
import type { BoardResponse } from '@/composition/board/api-contract';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity } from '@/lib/format/number';
import { BoardTile } from './BoardTile';
import {
  type BoardView,
  boardViewFrom,
  boardViewHref,
  characterParam,
  coverageNote,
  type CoveredSum,
  OVERVIEW,
  rosterTotals,
  skillNames,
  tileModel,
} from './board-view-model';
import { CharacterDetail } from './CharacterDetail';

// Marks the history entry a pilot opened from the roster, so the back control
// can step back to it instead of stacking a new roster entry on top.
const OPENED_FROM_ROSTER = 'lgiBoardOpened';

function openedFromRoster(): boolean {
  const state: unknown = window.history.state;
  return typeof state === 'object' && state !== null && OPENED_FROM_ROSTER in state;
}

function writeView(view: BoardView, push: boolean): void {
  const href = boardViewHref(window.location.pathname, window.location.search, view);
  if (push) window.history.pushState({ [OPENED_FROM_ROSTER]: true }, '', href);
  else window.history.replaceState(null, '', href);
}

const urlParam = () => characterParam(new URLSearchParams(window.location.search));

// The type tells HomeBoardView.css which way to sequence the morph.
function showParam(setParam: (param: string | null) => void, param: string | null): void {
  startTransition(() => {
    addTransitionType(param === null ? 'board-close' : 'board-open');
    setParam(param);
  });
}

const ROSTER_MOTION = {
  enter: { 'board-close': 'board-roster-in', default: 'none' },
  exit: { 'board-open': 'board-roster-out', default: 'none' },
} as const;

// The view lives in `?character=`: pushState keeps Back and Forward inside the
// page, and useSearchParams seeds the first render so a reload opens the same
// view. The view itself is local state set in startTransition, because Next's
// history sync commits outside the transition and <ViewTransition> never ran.
export function HomeBoardView({ board, now }: { board: BoardResponse; now: number }) {
  const params = useSearchParams();
  const [param, setParam] = useState(() => characterParam(params));
  const view = boardViewFrom(param, board.characters);

  const names = useMemo(() => skillNames(board.skillCatalog), [board.skillCatalog]);
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const lastOpened = useRef<number | null>(view.view === 'character' ? view.characterId : null);

  const open = useCallback((characterId: number) => {
    lastOpened.current = characterId;
    writeView({ view: 'character', characterId }, true);
    showParam(setParam, String(characterId));
  }, []);
  const back = useCallback(() => {
    if (openedFromRoster()) {
      window.history.back();
      return;
    }
    writeView(OVERVIEW, false);
    showParam(setParam, null);
  }, []);

  // Registered on the always-mounted view, not on the sheet: an Escape pressed
  // right after Forward reopened a sheet was missed when the sheet owned it.
  useEffect(() => {
    const onPop = () => showParam(setParam, urlParam());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && urlParam() !== null) back();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, [back]);

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
      root.querySelector<HTMLElement>(`[data-pilot-id="${lastOpened.current}"]`)?.focus({ preventScroll: true });
    }
  }, [shownId]);

  const selected = board.characters.find((c) => c.characterId === shownId);
  return (
    <div
      ref={rootRef}
      role={selected !== undefined ? 'article' : undefined}
      aria-label={selected !== undefined ? `${selected.name} character sheet` : undefined}
      className={cn(
        'relative scroll-mt-28',
        selected !== undefined && 'grid gap-x-16 gap-y-6 xl:grid-cols-[280px_minmax(0,1fr)]',
      )}
    >
      {selected !== undefined ? (
        <CharacterDetail
          rootRef={rootRef}
          backRef={backRef}
          character={selected}
          catalog={board.skillCatalog}
          names={names}
          now={now}
          onBack={back}
        />
      ) : (
        <ViewTransition {...ROSTER_MOTION} default="none">
          <div className="flex flex-col gap-6">
            <RosterTotalsLine board={board} now={now} />
            <div
              role="group"
              aria-label="Characters"
              className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {board.characters.map((character) => (
                <BoardTile key={character.characterId} tile={tileModel(character, names, now)} onOpen={open} />
              ))}
            </div>
          </div>
        </ViewTransition>
      )}
    </div>
  );
}

function sumText(sum: CoveredSum | null, format: (value: number) => string, unit: string): string | null {
  return sum === null ? null : `${format(sum.value)} ${unit}${coverageNote(sum)}`;
}

function RosterTotalsLine({ board, now }: { board: BoardResponse; now: number }) {
  const totals = rosterTotals(board.characters, now);
  const isk = sumText(totals.isk, formatIsk, 'ISK');
  const sp = sumText(totals.sp, formatCompactQuantity, 'SP');
  return (
    <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-data text-ui text-muted">
      <span>
        <span className="text-name">{totals.pilots}</span> {totals.pilots === 1 ? 'pilot' : 'pilots'}
      </span>
      {isk !== null && <span className="text-isk">{isk}</span>}
      {sp !== null && <span className="text-name">{sp}</span>}
      <span>
        <span className="text-evb-bright">{totals.training}</span> training
      </span>
    </p>
  );
}
