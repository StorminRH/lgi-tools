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
import type { BoardCharacter, BoardResponse, SkillCatalogGroup } from '@/composition/board/api-contract';
import { BoardLeaders } from './BoardLeaders';
import { LEADERS_MOTION } from './board-motion';
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

function writeView(view: BoardView, mode: 'push' | 'replace'): void {
  const href = boardViewHref(window.location.pathname, window.location.search, view);
  const state = mode === 'push' || focusedFromOverview() ? { [FOCUSED_FROM_OVERVIEW]: true } : null;
  if (mode === 'push' && view.view === 'character') window.history.pushState(state, '', href);
  else window.history.replaceState(view.view === 'overview' ? null : state, '', href);
}

const urlParam = () => characterParam(new URLSearchParams(window.location.search));

const viewKey = (view: BoardView) => (view.view === 'overview' ? 'overview' : `pilot-${view.characterId}`);

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
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={rootRef}
      role="article"
      aria-label={`${character.name} character sheet`}
      className="relative grid gap-x-16 gap-y-6 xl:grid-cols-[280px_minmax(0,1fr)]"
    >
      <CharacterDetail character={character} catalog={catalog} names={names} now={now} identity="column" />
      <BoardLeaders rootRef={rootRef} view="single" />
    </div>
  );
}

// The view lives in `?character=`: pushState keeps Back and Forward inside the
// page, and useSearchParams seeds the first render so a reload opens the same
// view. The view itself is local state set in startTransition, because Next's
// history sync commits outside the transition and <ViewTransition> never ran.
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
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  });
  const rootRef = useRef<HTMLDivElement>(null);

  const show = useCallback(
    (next: string | null) => {
      const to = boardViewFrom(next, board.characters);
      startTransition(() => {
        addTransitionType(boardTransitionType(viewRef.current, to));
        setParam(next);
      });
    },
    [board.characters],
  );

  const toOverview = useCallback(() => {
    if (viewRef.current.view === 'overview') return;
    if (focusedFromOverview()) {
      window.history.back();
      return;
    }
    writeView(OVERVIEW, 'replace');
    show(null);
  }, [show]);

  const select = useCallback(
    (characterId: number) => {
      const current = viewRef.current;
      if (current.view === 'character' && current.characterId === characterId) {
        toOverview();
        return;
      }
      writeView({ view: 'character', characterId }, current.view === 'overview' ? 'push' : 'replace');
      show(String(characterId));
    },
    [show, toOverview],
  );

  // On the always-mounted board, not on a sheet: an Escape pressed while a
  // swap is still running was missed when the outgoing sheet owned it.
  useEffect(() => {
    const onPop = () => show(urlParam());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) toOverview();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, [show, toOverview]);

  const key = viewKey(view);
  const keyBefore = useRef(key);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null || keyBefore.current === key) return;
    keyBefore.current = key;
    if (root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: 'start' });
  }, [key]);

  const pilots = railOrder(board.characters, mainId).map((character) => tileModel(character, names, now));
  const selected = view.view === 'character' ? board.characters.find((c) => c.characterId === view.characterId) : undefined;
  return (
    <div
      ref={rootRef}
      className="relative grid scroll-mt-28 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-x-12 xl:gap-x-16"
    >
      <PilotRail
        pilots={pilots}
        selectedId={selected?.characterId ?? null}
        onSelect={select}
        onOverview={toOverview}
      />
      <div
        role={selected === undefined ? 'region' : 'article'}
        aria-label={selected === undefined ? 'Pilot overview' : `${selected.name} character sheet`}
        className="flex min-w-0 flex-col gap-4"
      >
        {selected === undefined ? (
          <OverviewCards key={key} characters={board.characters} names={names} now={now} />
        ) : (
          <CharacterDetail
            key={key}
            character={selected}
            catalog={board.skillCatalog}
            names={names}
            now={now}
            identity="card"
          />
        )}
      </div>
      <ViewTransition key={key} {...LEADERS_MOTION} default="none">
        <BoardLeaders rootRef={rootRef} view={key} />
      </ViewTransition>
    </div>
  );
}
