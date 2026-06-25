'use client';

// The skill-queue island (3.4.7). Receives the signed-in pilot's linked
// characters as server props (names, portraits, scope health — Neon truth at
// render time) and joins them with the live Convex projection: useQuery
// streams every sync write over the websocket, so a queue updates with no
// reload and no client polling. Liveness comes from the presence-gated
// engine (3.4.9): the visibility-gated heartbeat keeps this subject hot
// while the tab is watched, and the engine refreshes it on the dataset's
// cadence — the ids it sends are a freshness hint only, never authority. The
// session gate and the whole live panel (sync hook, status line, per-character
// card shell) are shared with the industry-jobs panel
// (src/components/live-character-card); this slice supplies only its row,
// summary, and id-extraction.
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import {
  type CharacterCardContent,
  LiveCharacterPanel,
  LiveSessionGate,
  type PanelCharacter,
} from '@/components/live-character-card';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { api } from '@/data/convex/api';
import { formatQuantity } from '@/lib/format/number';
import { formatRemaining } from '@/lib/format/time';
import type { SkillQueueEntry } from '../esi-projection';
import { entryProgress, romanLevel, summarizeQueue } from '../progress';
import { STATUS_META } from '../skill-queue-styles';

export function SkillQueuePanel({ characters }: { characters: PanelCharacter[] }) {
  return (
    <LiveSessionGate
      characters={characters}
      emptyText={
        <>
          No characters linked to this account —{' '}
          <a href="/characters" className="underline text-name">
            link one on the Characters page
          </a>{' '}
          to see live skill queues.
        </>
      }
    >
      <LiveQueues characters={characters} />
    </LiveSessionGate>
  );
}

type LiveCharacter = NonNullable<
  FunctionReturnType<typeof api.skills.forViewer>
>['characters'][number];

// The one per-feature seam of useLiveCharacterSync: which type ids to resolve
// to names. Module-stable so it can sit in the hook's dependency list.
function skillTypeIds(characters: LiveCharacter[]): number[] {
  const ids: number[] = [];
  for (const character of characters) {
    for (const entry of character.data?.entries ?? []) ids.push(entry.skill_id);
  }
  return ids;
}

function LiveQueues({ characters }: { characters: PanelCharacter[] }) {
  const live = useQuery(api.skills.forViewer);
  return (
    <LiveCharacterPanel
      live={live}
      characters={characters}
      dataset="skills"
      extractTypeIds={skillTypeIds}
      liveLabel="Live · updates as syncs land"
      sectionLabel="Skill queue"
      scopePhrase="the skill scopes"
      noun="queue"
      emptyRowsText="No skills in the training queue."
      renderCard={renderQueueCard}
    />
  );
}

// One character's queue-card content: the SP subtitle, the "queue ends in" /
// paused header slot, and the per-entry rows. The panel owns the card shell.
function renderQueueCard(
  live: LiveCharacter | undefined,
  names: Record<string, string>,
  now: number,
): CharacterCardContent {
  const data = live?.data ?? null;
  const summary = data !== null ? summarizeQueue(data.entries, now) : null;

  const subtitle = data !== null && (
    <div className="text-[10px] text-muted tracking-[0.06em]">
      {formatQuantity(data.totalSp)} SP
      {data.unallocatedSp !== undefined && data.unallocatedSp > 0
        ? ` · ${formatQuantity(data.unallocatedSp)} unallocated`
        : ''}
    </div>
  );

  const headerRight = summary !== null && (
    <>
      {summary.kind === 'active' && summary.finishesAt !== null && (
        <span className="text-[10px] text-muted tracking-[0.06em] shrink-0">
          queue ends in {formatRemaining(summary.finishesAt - now)}
        </span>
      )}
      {summary.kind === 'paused' && <Pill tone="orange">Paused</Pill>}
    </>
  );

  return {
    isEmpty: data !== null && data.entries.length === 0,
    subtitle,
    headerRight,
    rows:
      data !== null &&
      data.entries.map((entry) => (
        <QueueEntryRow
          key={entry.queue_position}
          entry={entry}
          name={names[String(entry.skill_id)]}
          now={now}
        />
      )),
  };
}

function QueueEntryRow({
  entry,
  name,
  now,
}: {
  entry: SkillQueueEntry;
  name: string | undefined;
  now: number;
}) {
  const progress = entryProgress(entry, now);
  const meta = STATUS_META[progress.status];
  const finish = entry.finish_date !== undefined ? Date.parse(entry.finish_date) : null;

  return (
    <div className="border-t border-border-soft px-3.5 py-[6px]">
      <div className="grid grid-cols-[26px_minmax(0,1fr)_auto_auto] items-center gap-[6px] text-[12px]">
        <span className="text-[10px] text-muted">{entry.queue_position + 1}</span>
        <span className="text-name truncate leading-[1.5]">
          {name ?? `Skill #${entry.skill_id}`}{' '}
          <span className="text-muted">{romanLevel(entry.finished_level)}</span>
        </span>
        <span className="text-[10px] text-muted shrink-0">
          {progress.status === 'training' && finish !== null
            ? formatRemaining(finish - now)
            : ''}
        </span>
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </div>
      {progress.status === 'training' && (
        <div className="mt-[4px]">
          <ProgressBar pct={progress.pct} />
        </div>
      )}
    </div>
  );
}
