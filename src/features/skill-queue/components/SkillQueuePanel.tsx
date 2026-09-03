'use client';

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
import { EntityRow } from '@/components/ui/row';
import type { CharacterStripSpec } from '@/platform/page-settings/types';
import { formatRemaining } from '@/lib/format/time';
import type { SkillQueueEntry } from '../esi-projection';
import { romanLevel } from '../progress';
import { entryRowModel, type QueueHeader, queueCardModel } from '../queue-view';
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

  reconnectAction?: ReactNode;
  reconnectReason?: ReactNode;

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
            const data = live?.data ?? null;
            const { isEmpty, subtitle, headerRight, rows } = renderQueueCard(data, names, now);
            return (
              <LiveCharacterCard
                key={character.characterId}
                character={character}
                syncError={null}
                lastSyncedAt={live?.lastRefreshedAt}
                hasData={data !== null}
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

function renderQueueCard(
  data: CharacterSkillData | null,
  names: Record<string, string>,
  now: number,
): CharacterCardContent {
  const model = queueCardModel(data, now);
  return {
    isEmpty: model.isEmpty,
    subtitle: model.subtitle !== null && (
      <div className="text-micro text-muted tracking-copy">{model.subtitle}</div>

    ),
    headerRight: model.header !== null && <QueueHeaderSlot header={model.header} />,
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

function QueueHeaderSlot({ header }: { header: NonNullable<QueueHeader> }) {
  if (header.kind === 'ends-in') {
    return (
      <span className="shrink-0 font-data text-micro tracking-copy text-muted">
        queue ends in {formatRemaining(header.ms)}
      </span>

    );
  }
  return <Pill tone="orange">Paused</Pill>;

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
  const model = entryRowModel(entry, now);
  return (
    <div>
      <EntityRow
        colsClass="grid-cols-[26px_minmax(0,1fr)_auto_auto]"
        leading={entry.queue_position + 1}
        name={
          <span className="font-data">
            {name ?? `Skill #${entry.skill_id}`}{' '}
            <span className="text-muted">{romanLevel(entry.finished_level)}</span>

          </span>

        }
        chips={<Pill tone={model.meta.tone}>{model.meta.label}</Pill>}

        trailing={
          model.remainingMs !== null ? (
            <span className="font-data">{formatRemaining(model.remainingMs)}</span>

          ) : (
            ''
          )
        }
      />
      {model.showBar && (
        <div className="mt-[4px]">
          <ProgressBar pct={model.pct} />
        </div>

      )}
    </div>

  );
}
