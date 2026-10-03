import type { ReactNode } from 'react';
import { EveSignInButton } from '@/components/composition/account/LoginButton';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { IntroCard } from '@/components/composition/industry-workspace/WorkspaceStates';
import { SectionLabel } from '@/components/ui/section-label';
import { CorpJobsBoard } from '@/features/industry-jobs/components/CorpJobsBoard';
import { IndustryJobsPanel } from '@/features/industry-jobs/components/IndustryJobsPanel';
import { JobsCardSkeleton } from '@/features/industry-jobs/components/JobsCard';
import { jobsPageSettings } from '@/features/industry-jobs/page-settings';
import { industryCharacters } from '../industry-characters';

function JobsIntro({ line, action }: { line: string; action: ReactNode }) {
  return (
    <IntroCard>
      <div className="flex max-w-xl flex-col gap-1">
        <h2 className="font-display text-h3 font-bold text-name">Active jobs</h2>
        <p className="text-ui text-muted">{line}</p>
      </div>
      {action}
    </IntroCard>
  );
}

export async function JobsContent() {
  const found = await industryCharacters();
  if (found === null) {
    return (
      <JobsIntro
        line="Every industry job across your characters and corporations, live as they run."
        action={<EveSignInButton callbackURL="/industry/jobs" />}
      />
    );
  }
  if (found.characters.length === 0) {
    return (
      <JobsIntro
        line="Link a character to see its industry jobs here."
        action={<LinkCharacterButton label="Link a character" callbackURL="/industry/jobs" />}
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-10">
      <IndustryJobsPanel characters={found.characters} strip={jobsPageSettings.strip} />
      <CorpJobsBoard
        eligibleCharacterIds={found.corpIds}
        reconnectAction={
          <LinkCharacterButton
            label="Grant corp jobs access"
            emphasis="reconnect"
            callbackURL="/industry/jobs"
          />
        }
      />
    </div>
  );
}

export function JobsLoading() {
  return (
    <div className="flex w-full flex-col gap-10">
      {['Personal jobs', 'Corporation jobs'].map((heading) => (
        <section key={heading} aria-label={heading} className="flex flex-col gap-4">
          <SectionLabel>{heading}</SectionLabel>
          <JobsCardSkeleton />
        </section>
      ))}
    </div>
  );
}
