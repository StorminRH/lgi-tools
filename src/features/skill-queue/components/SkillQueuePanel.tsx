'use client';

// The skill-queue island. Receives the signed-in pilot's linked characters as server
// props (names, portraits, scope health — Neon truth at render time) and fetches each
// one's trained totals + training queue from /api/account/skills on view (MIGRATE.B.1
// — the queue moved off the live Convex engine onto a Neon stale-gated on-view read).
// The queue's live progress and completion are derived CLIENT-SIDE from each entry's
// absolute finish_date (progress.ts) against a 30s render clock, so a finishing skill
// flips to done with no reload and no polling; the on-view fetch reconciles only the
// queue's shape. The per-character card shell (portrait header, reconnect/as-of
// callouts, null/empty/rows tristate) is the shared LiveCharacterCard; this slice
// supplies the row + summary.
import type { ReactNode } from 'react';
import { syncEligibleIds } from '@/components/character-strip-model';
import { CharacterStripSection } from '@/components/character-strip-section';
import {
  type CharacterCardContent,
  LiveCharacterCard,
  type PanelCharacter,
} from '@/components/live-character-card';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import type { CharacterStripSpec } from '@/page-settings/types';
import { formatQuantity } from '@/lib/format/number';
import { formatRemaining } from '@/lib/format/time';
import type { SkillQueueEntry } from '../esi-projection';
import { entryProgress, romanLevel, summarizeQueue } from '../progress';
import { STATUS_META } from '../skill-queue-styles';
import type { CharacterSkillData } from '../types';
import { useSkillsLive } from '../use-skills-live';

export function SkillQueuePanel({
  characters,
  reconnectAction,
  reconnectReason,
  strip,
  initialDimmed,
}: {
  characters: PanelCharacter[];
  // The in-place scope-grant control + its reason, composed by the page (app
  // layer) and forwarded to each per-character card's gate.
  reconnectAction?: ReactNode;
  reconnectReason?: ReactNode;
  // The page's spec.strip declaration (D-7 opt-in) + the cookie-read dimmed set
  // for the first paint. Absent = no strip, no filtering — today's render.
  strip?: CharacterStripSpec;
  initialDimmed?: number[];
}) {
  if (characters.length === 0) {
    return (
      <Card>
        <EmptyState>
          No characters linked to this account —{' '}
          <a href="/characters" className="underline text-name">
            link one on the Characters page
          </a>{' '}
          to see live skill queues.
        </EmptyState>
      </Card>
    );
  }
  return (
    <LiveQueues
      characters={characters}
      reconnectAction={reconnectAction}
      reconnectReason={reconnectReason}
      strip={strip}
      initialDimmed={initialDimmed}
    />
  );
}

// The live half of one row: the cached payload + its "as of" stamp. renderQueueCard
// reads only `data`; lastSyncedAt feeds the card's as-of header.
interface SkillsLiveRow {
  data: CharacterSkillData | null;
  lastSyncedAt: number | null;
}

function LiveQueues({
  characters,
  reconnectAction,
  reconnectReason,
  strip,
  initialDimmed,
}: {
  characters: PanelCharacter[];
  reconnectAction?: ReactNode;
  reconnectReason?: ReactNode;
  strip?: CharacterStripSpec;
  initialDimmed?: number[];
}) {
  // The sync ids derive from the FULL list — dimming is a render filter only
  // (view-only pin): a dimmed character keeps its on-view refresh.
  const eligibleIds = syncEligibleIds(characters);
  const { skillsByCharacter, names, now, loading } = useSkillsLive(eligibleIds);

  return (
    <div className="w-full max-w-[760px] flex flex-col gap-6">
      <CharacterStripSection
        characters={characters}
        strip={strip}
        initialDimmed={initialDimmed}
        loading={loading}
      >
        {(visible) =>
          visible.map((character) => {
            const live = skillsByCharacter.get(character.characterId);
            const row: SkillsLiveRow | undefined =
              live !== undefined
                ? { data: live.data, lastSyncedAt: live.lastRefreshedAt }
                : undefined;
            const { isEmpty, subtitle, headerRight, rows } = renderQueueCard(row, names, now);
            return (
              <LiveCharacterCard
                key={character.characterId}
                character={character}
                syncError={null}
                lastSyncedAt={row?.lastSyncedAt}
                hasData={(row?.data ?? null) !== null}
                isEmpty={isEmpty}
                syncing={false}
                sectionLabel="Skill queue"
                scopePhrase="the skill scopes"
                noun="queue"
                subtitle={subtitle}
                headerRight={headerRight}
                emptyRowsText="No skills in the training queue."
                reconnectAction={reconnectAction}
                reconnectReason={reconnectReason}
              >
                {rows}
              </LiveCharacterCard>
            );
          })
        }
      </CharacterStripSection>
    </div>
  );
}

// One character's queue-card content: the SP subtitle, the "queue ends in" / paused
// header slot, and the per-entry rows. The panel owns the card shell.
function renderQueueCard(
  live: SkillsLiveRow | undefined,
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
          {progress.status === 'training' && finish !== null ? formatRemaining(finish - now) : ''}
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
