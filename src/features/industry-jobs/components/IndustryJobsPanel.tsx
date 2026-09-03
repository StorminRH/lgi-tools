'use client';

import { syncEligibleIds } from '@/components/character-strip-model';
import { CharacterStripSection } from '@/components/character-strip-section';
import {
  type CharacterCardContent,
  LiveCharacterCard,
  type PanelCharacter,
} from '@/components/live-character-card';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { CharacterStripSpec } from '@/platform/page-settings/types';
import { formatRemaining } from '@/lib/format/time';
import type { IndustryJob } from '../esi-projection';
import { jobRowFrameData, jobsCardModel } from '../job-view';
import type { CharacterJobsData } from '../types';
import { useJobsLive } from '../use-jobs-live';
import { JobRowFrame } from './JobRowFrame';

export function IndustryJobsPanel({
  characters,
  strip,
  initialDimmed,
}: {
  characters: PanelCharacter[];

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

          to see live industry jobs.
        </EmptyState>

      </Card>

    );
  }
  return <LiveJobs characters={characters} strip={strip} initialDimmed={initialDimmed} />;
}

function LiveJobs({
  characters,
  strip,
  initialDimmed,
}: {
  characters: PanelCharacter[];
  strip?: CharacterStripSpec;
  initialDimmed?: number[];
}) {

  const eligibleIds = syncEligibleIds(characters);
  const { jobsByCharacter, names, now, loading } = useJobsLive(eligibleIds);

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
            const live = jobsByCharacter.get(character.characterId);
            const data = live?.data ?? null;
            const { isEmpty, subtitle, headerRight, rows } = renderJobsCard(data, names, now);
            return (
              <LiveCharacterCard
                key={character.characterId}
                character={character}
                syncError={null}
                lastSyncedAt={live?.lastRefreshedAt}
                hasData={data !== null}
                isEmpty={isEmpty}
                syncing={false}
                sectionLabel="Industry jobs"
                scopePhrase="the industry scope"
                noun="jobs"
                subtitle={subtitle}
                headerRight={headerRight}
                emptyRowsText="No industry jobs running."
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

function renderJobsCard(
  data: CharacterJobsData | null,
  names: Record<string, string>,
  now: number,
): CharacterCardContent {
  const model = jobsCardModel(data, now);
  return {
    isEmpty: model.isEmpty,
    subtitle: model.subtitle !== null && (
      <div className="text-label text-muted tracking-copy">{model.subtitle}</div>

    ),
    headerRight: model.nextDoneMs !== null && (
      <span className="shrink-0 font-data text-micro tracking-copy text-muted">
        next done in {formatRemaining(model.nextDoneMs)}
      </span>

    ),
    rows: data !== null && data.jobs.map((job) => <JobRow key={job.job_id} job={job} names={names} now={now} />),
  };
}

function JobRow({ job, names, now }: { job: IndustryJob; names: Record<string, string>; now: number }) {
  return <JobRowFrame {...jobRowFrameData(job, names, now)} />;
}
