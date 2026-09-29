'use client';

import { type ReactNode, useMemo } from 'react';
import { syncEligibleIds } from '@/components/character-strip-model';
import type { PanelCharacter } from '@/components/live-character-card';
import { KpiTile, SectionPanel } from '@/components/ui/readout';
import { SheetHeading, SheetLayout } from '@/components/ui/sheet-layout';
import type { CharacterStripSpec } from '@/platform/page-settings/types';
import { formatRemaining } from '@/lib/format/time';
import { jobCounts } from '../flatten-jobs';
import { summarizeJobs } from '../job-state';
import { useIndustryDesk } from '../use-industry-desk';
import { CorpJobsBoard } from './CorpJobsBoard';
import { IndustryActiveJobs } from './IndustryActiveJobs';
import { IndustryJobsPanel } from './IndustryJobsPanel';
import { SlotUsage } from './SlotUsage';

/**
 * Every live job in one place: what is ready to deliver across pilots, each
 * pilot's board, then the corporation's. The column beside it keeps the
 * counts and slot usage in view while the lists scroll.
 */
export function ActiveJobsBoard({
  characters,
  strip,
  initialDimmed,
  corpEligibleCharacterIds,
  reconnectAction,
}: {
  characters: PanelCharacter[];
  strip?: CharacterStripSpec;
  initialDimmed?: number[];
  corpEligibleCharacterIds: number[];
  reconnectAction: ReactNode;
}) {
  const eligibleIds = useMemo(() => syncEligibleIds(characters), [characters]);
  const desk = useIndustryDesk(eligibleIds, corpEligibleCharacterIds);
  const { jobsLive } = desk;
  const pilotNames = useMemo(
    () => Object.fromEntries(characters.map((character) => [character.characterId, character.name])),
    [characters],
  );
  const ready = desk.personalJobs.filter((job) => job.status === 'ready');
  const counts = jobCounts(desk.personalJobs);
  const { nextEndAt } = summarizeJobs(desk.personalJobs, jobsLive.now);
  const figure = (value: string | number) => (jobsLive.loading ? '…' : value);

  return (
    <SheetLayout
      aside={
        <>
          <SheetHeading title="Active jobs">Live jobs across your pilots and corporations.</SheetHeading>
          <dl className="grid grid-cols-3 gap-2 xl:grid-cols-2">
            <KpiTile label="Ready" tone={counts.complete > 0 ? 'text-isk' : 'text-name'}>
              {figure(counts.complete)}
            </KpiTile>
            <KpiTile label="Running">{figure(counts.inProgress)}</KpiTile>
            <KpiTile label="Next done" tone="text-evb-bright">
              {figure(nextEndAt === null ? '—' : formatRemaining(nextEndAt - jobsLive.now))}
            </KpiTile>
          </dl>
          {desk.slots !== null && <SlotUsage slots={desk.slots} />}
        </>
      }
    >
      {ready.length > 0 && (
        <SectionPanel title="Ready to deliver" meta={`${ready.length} job${ready.length === 1 ? '' : 's'}`}>
          <div className="overflow-x-auto">
            <IndustryActiveJobs jobs={ready} names={jobsLive.names} now={jobsLive.now} pilotNames={pilotNames} />
          </div>
        </SectionPanel>
      )}
      <IndustryJobsPanel characters={characters} live={jobsLive} strip={strip} initialDimmed={initialDimmed} />
      <CorpJobsBoard
        eligibleCharacterIds={corpEligibleCharacterIds}
        hasLinkedCharacters={characters.length > 0}
        live={desk.corpLive}
        reconnectAction={reconnectAction}
      />
    </SheetLayout>
  );
}
