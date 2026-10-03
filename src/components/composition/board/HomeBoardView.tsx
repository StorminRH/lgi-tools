'use client';

import { useCallback, useMemo, ViewTransition } from 'react';
import { cn } from '@/components/ui/cn';
import type {
  BoardCharacter,
  BoardHistoryDay,
  BoardResponse,
  SkillCatalogGroup,
} from '@/composition/board/api-contract';
import { boardViewFrom, railOrder, skillNames, tileModel } from './board-view-model';
import { OVERVIEW_MOTION } from './board-motion';
import { CharacterDetail } from './CharacterDetail';
import { OverviewCards } from './OverviewCards';
import { PilotRail } from './PilotRail';
import { useFocusView } from './use-focus-view';

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
    return (
      <SinglePilot character={only} history={board.history} catalog={board.skillCatalog} names={names} now={now} />
    );
  }
  return <PilotBoard board={board} names={names} now={now} mainId={mainId} />;
}

function SinglePilot({
  character,
  history,
  catalog,
  names,
  now,
}: {
  character: BoardCharacter;
  history: readonly BoardHistoryDay[];
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
      <CharacterDetail character={character} history={history} catalog={catalog} names={names} now={now} addCharacter />
    </div>
  );
}

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
  const resolve = useCallback((param: string | null) => boardViewFrom(param, board.characters), [board.characters]);
  const { view, open, toOverview, rootRef, backRef } = useFocusView(resolve, 'data-pilot-id');
  const shownId = view.view === 'character' ? view.characterId : null;

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
          history={board.history}
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
        <OverviewCards characters={board.characters} history={board.history} now={now} />
      </ViewTransition>
    </div>
  );
}
