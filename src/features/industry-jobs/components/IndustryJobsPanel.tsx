'use client';

// The industry-jobs island (MIGRATE.B.2). Receives the signed-in pilot's linked
// characters as server props (names, portraits, scope health — Neon truth at render
// time) and fetches each one's active job board from /api/account/industry-jobs on view
// (the board moved off the live Convex engine onto a Neon stale-gated on-view read). Each
// job's live "ready" + countdown is derived CLIENT-SIDE from its absolute end_date
// (job-state.ts) against a 30s render clock, so a finishing job flips to ready with no
// reload and no scheduler; the on-view fetch reconciles only the board's EXISTENCE. The
// per-character card shell (portrait header, reconnect/as-of callouts, null/empty/rows
// tristate) is the shared LiveCharacterCard; this slice supplies the row + summary.
import { syncEligibleIds } from '@/components/character-strip-model';
import { CharacterStripSection } from '@/components/character-strip-section';
import {
  type CharacterCardContent,
  LiveCharacterCard,
  type PanelCharacter,
} from '@/components/live-character-card';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { CharacterStripSpec } from '@/page-settings/types';
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
  // The sync ids derive from the FULL list — dimming is a render filter only
  // (view-only pin): a dimmed character keeps its on-view refresh.
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

// One character's jobs-card content: the jobs-count subtitle, the "next done in" header
// slot, and the per-job rows. The decisions live in jobsCardModel (tested); this shell
// only wires them into the card-content slots.
function renderJobsCard(
  data: CharacterJobsData | null,
  names: Record<string, string>,
  now: number,
): CharacterCardContent {
  const model = jobsCardModel(data, now);
  return {
    isEmpty: model.isEmpty,
    subtitle: model.subtitle !== null && (
      <div className="text-[10px] text-muted tracking-[0.06em]">{model.subtitle}</div>
    ),
    headerRight: model.nextDoneMs !== null && (
      <span className="text-[10px] text-muted tracking-[0.06em] shrink-0">
        next done in {formatRemaining(model.nextDoneMs)}
      </span>
    ),
    rows: data !== null && data.jobs.map((job) => <JobRow key={job.job_id} job={job} names={names} now={now} />),
  };
}

function JobRow({ job, names, now }: { job: IndustryJob; names: Record<string, string>; now: number }) {
  return <JobRowFrame {...jobRowFrameData(job, names, now)} />;
}
