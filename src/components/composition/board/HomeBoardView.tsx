'use client';

import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { BoardResponse } from '@/composition/board/api-contract';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity } from '@/lib/format/number';
import { BoardTile } from './BoardTile';
import {
  coverageNote,
  type CoveredSum,
  defaultSelection,
  parseRememberedSelection,
  rosterTotals,
  SELECTION_STORAGE_KEY,
  skillNames,
  tileModel,
} from './board-view-model';
import { CharacterDetail } from './CharacterDetail';

const noSubscribe = () => () => {};

function readRemembered(): number | null {
  try {
    return parseRememberedSelection(window.localStorage.getItem(SELECTION_STORAGE_KEY));
  } catch {
    return null;
  }
}

function remember(characterId: number): void {
  try {
    window.localStorage.setItem(SELECTION_STORAGE_KEY, String(characterId));
  } catch {}
}

// Scrolling the sheet into view only helps when it sits below the tile strip.
function revealOnNarrow(element: HTMLElement | null): void {
  if (element === null || !window.matchMedia('(max-width: 767px)').matches) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

export function HomeBoardView({
  board,
  now,
  sessionCharacterId = null,
}: {
  board: BoardResponse;
  now: number;
  sessionCharacterId?: number | null;
}) {
  const names = useMemo(() => skillNames(board.skillCatalog), [board.skillCatalog]);
  // The server snapshot is null, so storage is read only after hydration.
  const remembered = useSyncExternalStore(noSubscribe, readRemembered, () => null);
  const [picked, setPicked] = useState<number | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  const selectedId =
    picked !== null && board.characters.some((c) => c.characterId === picked)
      ? picked
      : defaultSelection(board.characters, remembered, sessionCharacterId);
  const selected = board.characters.find((c) => c.characterId === selectedId) ?? null;

  const select = (characterId: number) => {
    setPicked(characterId);
    remember(characterId);
    revealOnNarrow(detailRef.current);
  };

  return (
    <div className="flex flex-col gap-4">
      <RosterTotalsLine board={board} now={now} />
      <div
        role="group"
        aria-label="Characters"
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 md:mx-0 md:grid md:snap-none md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] md:overflow-visible md:px-0 md:pb-0"
      >
        {board.characters.map((character) => (
          <BoardTile
            key={character.characterId}
            tile={tileModel(character, names, now)}
            selected={character.characterId === selectedId}
            onSelect={select}
          />
        ))}
      </div>
      {selected !== null && (
        <CharacterDetail
          ref={detailRef}
          character={selected}
          catalog={board.skillCatalog}
          names={names}
          now={now}
        />
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
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-data text-ui text-muted">
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
