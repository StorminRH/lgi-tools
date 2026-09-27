'use client';

import { useSearchParams } from 'next/navigation';
import {
  addTransitionType,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  ViewTransition,
} from 'react';
import { cn } from '@/components/ui/cn';
import type { BoardCharacter, BoardResponse, SkillCatalogGroup } from '@/composition/board/api-contract';
import {
  type BoardView,
  boardTransitionType,
  boardViewFrom,
  boardViewHref,
  characterParam,
  OVERVIEW,
  railOrder,
  skillNames,
  tileModel,
} from './board-view-model';
import { OVERVIEW_MOTION } from './board-motion';
import { CharacterDetail } from './CharacterDetail';
import { OverviewCards } from './OverviewCards';
import { PilotRail } from './PilotRail';

// Marks the history entry a pilot was focused from the overview, so going
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

const SHEET_GRID = 'grid gap-x-10 gap-y-6 xl:grid-cols-[280px_minmax(0,1fr)]';

export function HomeBoardView({
  board,
  now,
  mainId = null,
}: {
  board: BoardResponse;
  now: number;
  mainId?: number | null;
}) {
  const names = useMemo(() => skillNames(board.skillCatalog), [board.skillCatalog]);
  const [only] = board.characters;
  if (board.characters.length === 1 && only !== undefined) {
    return <SinglePilot character={only} catalog={board.skillCatalog} names={names} now={now} />;
  }
  return <PilotBoard board={board} names={names} now={now} mainId={mainId} />;
}

function SinglePilot({
  character,
  catalog,
  names,
  now,
}: {
  character: BoardCharacter;
  catalog: readonly SkillCatalogGroup[];
  names: Readonly<Record<string, string>>;
  now: number;
}) {
  return (
    <div
      role="article"
      aria-label={`${character.name} character sheet`}
      className={SHEET_GRID}
    >
      <CharacterDetail character={character} catalog={catalog} names={names} now={now} addCharacter />
    </div>
  );
}

// The view lives in `?character=`: pushState keeps Back and Forward inside the
// page, and useSearchParams seeds the first render so a reload opens the same
// view. The view itself is local state set in startTransition, because Next's
// history sync commits outside the transition and <ViewTransition> never ran.
// Every part the transition animates is a direct child of the persistent
// container: React runs enter and exit only on a <ViewTransition> with no new
// DOM node above it.
function PilotBoard({
  board,
  names,
  now,
  mainId,
}: {
  board: BoardResponse;
  names: Readonly<Record<string, string>>;
  now: number;
  mainId: number | null;
}) {
  const params = useSearchParams();
  const [param, setParam] = useState(() => characterParam(params));
  const view = boardViewFrom(param, board.characters);
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const lastOpened = useRef<number | null>(view.view === 'character' ? view.characterId : null);

  const show = useCallback(
    (next: string | null) => {
      startTransition(() => {
        addTransitionType(boardTransitionType(boardViewFrom(next, board.characters)));
        setParam(next);
      });
    },
    [board.characters],
  );

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
    const onPop = () => show(urlParam());
    const onKey = (event: KeyboardEvent) => {
      // An open drawer or dialog owns Escape: it closes first, the sheet stays.
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[data-drawer-popup], [role="dialog"]') !== null) return;
      toOverview();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, [show, toOverview]);

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
  if (selected !== undefined) {
    return (
      <div
        ref={rootRef}
        role="article"
        aria-label={`${selected.name} character sheet`}
        className={cn('scroll-mt-28', SHEET_GRID)}
      >
        <CharacterDetail
          character={selected}
          catalog={board.skillCatalog}
          names={names}
          now={now}
          onBack={toOverview}
          backRef={backRef}
        />
      </div>
    );
  }
  const pilots = railOrder(board.characters, mainId).map((character) => tileModel(character, names, now));
  return (
    <div
      ref={rootRef}
      className="grid scroll-mt-28 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-x-10"
    >
      <ViewTransition {...OVERVIEW_MOTION} default="none">
        <PilotRail pilots={pilots} onSelect={open} />
      </ViewTransition>
      <ViewTransition {...OVERVIEW_MOTION} default="none">
        <OverviewCards characters={board.characters} now={now} />
      </ViewTransition>
    </div>
  );
}
