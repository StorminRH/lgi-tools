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
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import type { CharacterStripSpec } from '@/page-settings/types';
import { formatRemaining } from '@/lib/format/time';
import type { IndustryJob } from '../esi-projection';
import { JOB_STATUS_META, jobActivityLabel } from '../industry-jobs-styles';
import { jobProgress, summarizeJobs } from '../job-state';
import type { CharacterJobsData } from '../types';
import { useJobsLive } from '../use-jobs-live';

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

// The live half of one row: the cached board + its "as of" stamp. renderJobsCard reads
// only `data`; lastSyncedAt feeds the card's as-of header.
interface JobsLiveRow {
  data: CharacterJobsData | null;
  lastSyncedAt: number | null;
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
            const row: JobsLiveRow | undefined =
              live !== undefined
                ? { data: live.data, lastSyncedAt: live.lastRefreshedAt }
                : undefined;
            const { isEmpty, subtitle, headerRight, rows } = renderJobsCard(row, names, now);
            return (
              <LiveCharacterCard
                key={character.characterId}
                character={character}
                syncError={null}
                lastSyncedAt={row?.lastSyncedAt}
                hasData={(row?.data ?? null) !== null}
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
// slot, and the per-job rows. The panel owns the card shell.
function renderJobsCard(
  live: JobsLiveRow | undefined,
  names: Record<string, string>,
  now: number,
): CharacterCardContent {
  const data = live?.data ?? null;
  const summary = data !== null ? summarizeJobs(data.jobs, now) : null;

  const subtitle = summary !== null && (
    <div className="text-[10px] text-muted tracking-[0.06em]">
      {summary.total === 1 ? '1 job' : `${summary.total} jobs`}
      {summary.readyCount > 0 ? ` · ${summary.readyCount} ready` : ''}
      {summary.pausedCount > 0 ? ` · ${summary.pausedCount} paused` : ''}
    </div>
  );

  const headerRight = summary !== null && summary.nextEndAt !== null && (
    <span className="text-[10px] text-muted tracking-[0.06em] shrink-0">
      next done in {formatRemaining(summary.nextEndAt - now)}
    </span>
  );

  return {
    isEmpty: data !== null && data.jobs.length === 0,
    subtitle,
    headerRight,
    rows:
      data !== null &&
      data.jobs.map((job) => <JobRow key={job.job_id} job={job} names={names} now={now} />),
  };
}

function JobRow({
  job,
  names,
  now,
}: {
  job: IndustryJob;
  names: Record<string, string>;
  now: number;
}) {
  const meta = JOB_STATUS_META[job.status];
  // The product is the headline where one exists (manufacturing, invention,
  // reactions); research/copy jobs are about the blueprint itself.
  const headlineId = job.product_type_id ?? job.blueprint_type_id;
  const end = Date.parse(job.end_date);

  return (
    <div className="border-t border-border-soft px-3.5 py-[6px]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-[6px] text-[12px]">
        <span className="text-name truncate leading-[1.5]">
          {names[String(headlineId)] ?? `Type #${headlineId}`}{' '}
          <span className="text-muted">
            ×{job.runs} · {jobActivityLabel(job.activity_id)}
          </span>
        </span>
        <span className="text-[10px] text-muted shrink-0">
          {job.status === 'active' && Number.isFinite(end)
            ? `done in ${formatRemaining(end - now)}`
            : ''}
        </span>
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </div>
      {(job.status === 'active' || job.status === 'paused') && (
        <div className="mt-[4px]">
          <ProgressBar pct={jobProgress(job, now)} />
        </div>
      )}
    </div>
  );
}
