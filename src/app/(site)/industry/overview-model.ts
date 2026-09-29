import type { IndustryJob } from '@/features/industry-jobs/esi-projection';
import { jobCounts } from '@/features/industry-jobs/flatten-jobs';
import { type SlotMetaModel, slotTotal } from '@/features/industry-jobs/slots';
import type { SavedPlanRow } from '@/features/industry-planner/api-contract';
import type { RecentBlueprint } from '@/features/industry-planner/recent-blueprints';
import type { IndustrySectionId } from './industry-sections';

export type RailTone = 'isk' | 'name' | 'muted' | 'faint' | 'warn';

export interface RailSegment {
  text: string;
  tone: RailTone;
}

/** A rail line is a run of segments, so a count can be lit inside quieter text. */
export type RailLine = RailSegment[];

export type RailSectionId = Exclude<IndustrySectionId, 'overview'>;

export interface OverviewInputs {
  signedIn: boolean;
  jobs: { loading: boolean; failed: boolean; list: readonly IndustryJob[] };
  slots: SlotMetaModel | null;
  recent: readonly RecentBlueprint[] | null;
  plans: readonly SavedPlanRow[] | null;
  plansFailed: boolean;
  watchlist: readonly RecentBlueprint[] | null;
}

const line = (text: string, tone: RailTone): RailLine => [{ text, tone }];

function jobsLines({ signedIn, jobs, slots }: OverviewInputs): RailLine[] {
  if (!signedIn) return [line('Sign in to follow live jobs', 'faint')];
  if (jobs.loading) return [line('Syncing…', 'faint')];
  if (jobs.failed) return [line('Couldn’t load jobs', 'warn')];
  const { complete, inProgress } = jobCounts(jobs.list);
  const status: RailLine = [];
  if (complete > 0) status.push({ text: `${complete} ready`, tone: 'isk' });
  if (inProgress > 0) status.push({ text: `${status.length > 0 ? ' · ' : ''}${inProgress} running`, tone: 'muted' });
  const lines = [status.length > 0 ? status : line('No jobs running', 'faint')];
  if (slots !== null) {
    const { used, total } = slotTotal(slots);
    lines.push(line(`${used}/${total} slots in use`, 'faint'));
  }
  return lines;
}

function planLines({ recent }: OverviewInputs): RailLine[] {
  if (recent === null) return [];
  const [latest] = recent;
  if (latest === undefined) return [line('Pick a blueprint to plan', 'faint')];
  return [[{ text: 'Continue ', tone: 'faint' }, { text: latest.name, tone: 'name' }]];
}

function researchLines({ watchlist }: OverviewInputs): RailLine[] {
  if (watchlist === null) return [];
  if (watchlist.length === 0) return [line('Compare prices and demand', 'faint')];
  return [line(`${watchlist.length} watched`, 'muted')];
}

function templatesLines({ signedIn, plans, plansFailed }: OverviewInputs): RailLine[] {
  if (!signedIn) return [line('Sign in to save templates', 'faint')];
  if (plansFailed) return [line('Couldn’t load templates', 'warn')];
  if (plans === null) return [];
  if (plans.length === 0) return [line('None saved yet', 'faint')];
  const favorites = plans.filter((plan) => plan.favorite).length;
  const saved: RailLine = [{ text: `${plans.length} saved`, tone: 'muted' }];
  if (favorites > 0) saved.push({ text: ` · ${favorites} ★`, tone: 'isk' });
  return [saved];
}

/** What each section's rail entry says about it right now. */
export function railSummaries(inputs: OverviewInputs): Record<RailSectionId, RailLine[]> {
  return {
    jobs: jobsLines(inputs),
    plan: planLines(inputs),
    research: researchLines(inputs),
    templates: templatesLines(inputs),
  };
}
