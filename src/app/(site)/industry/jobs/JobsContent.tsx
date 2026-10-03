import { CharacterPanelSkeleton } from '@/components/composition/CharacterPanelSkeleton';
import { EveSignInButton } from '@/components/composition/account/LoginButton';
import { Card } from '@/components/ui/card';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { CorpJobsBoard } from '@/features/industry-jobs/components/CorpJobsBoard';
import { IndustryJobsPanel } from '@/features/industry-jobs/components/IndustryJobsPanel';
import { jobsPageSettings } from '@/features/industry-jobs/page-settings';
import { industryCharacters } from '../industry-characters';

export async function JobsContent() {
  const found = await industryCharacters();
  if (found === null) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-4 px-5 py-5">
          <p className="text-ui text-muted">Sign in with EVE to see your active industry jobs.</p>
          <EveSignInButton callbackURL="/industry/jobs" />
        </div>
      </Card>
    );
  }

  return (
    <div className="flex w-full flex-col gap-10">
      <IndustryJobsPanel characters={found.characters} strip={jobsPageSettings.strip} />
      <CorpJobsBoard
        eligibleCharacterIds={found.corpIds}
        hasLinkedCharacters={found.characters.length > 0}
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
      <CharacterPanelSkeleton label="Loading personal jobs" />
      <CharacterPanelSkeleton rows={1} label="Loading corporation jobs" />
    </div>
  );
}
