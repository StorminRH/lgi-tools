'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { syncEligibleIds } from '@/components/character-strip-model';
import { CharacterStripSection } from '@/components/character-strip-section';
import { Callout } from '@/components/ui/callout';
import { LoadFailed } from '@/components/ui/load-failed';
import type { PanelCharacter } from '@/platform/auth/panel-character';
import type { CharacterStripSpec } from '@/platform/page-settings/types';
import { useJobsLive } from '../use-jobs-live';
import { JobsCard } from './JobsCard';

/** The account's own pilots' jobs, one card each. */
export function IndustryJobsPanel({
  characters,
  strip,
}: {
  characters: PanelCharacter[];
  strip?: CharacterStripSpec;
}) {
  const eligibleIds = syncEligibleIds(characters);
  const { jobsByCharacter, names, now, loading, failed, retry } = useJobsLive(eligibleIds);

  return (
    <CharacterStripSection
      heading="Personal jobs"
      characters={characters}
      strip={strip}
      failure={
        failed ? (
          <LoadFailed title="Industry jobs didn't load" retryLabel="Retry loading industry jobs" onRetry={retry} />
        ) : null
      }
    >
      {(visible) =>
        // A failed read has nothing to show per character; the notice says so.
        !failed &&
        visible.map((character) => {
          const live = jobsByCharacter.get(character.characterId);
          return (
            <JobsCard
              key={character.characterId}
              avatar={
                <CharacterPortrait
                  characterId={character.characterId}
                  name={character.name}
                  size={36}
                  src={character.portraitUrl}
                />
              }
              title={character.name}
              notice={character.needsReconnect ? <ReconnectNotice /> : undefined}
              data={live?.data ?? null}
              lastSyncedAt={live?.lastRefreshedAt}
              names={names}
              now={now}
              loading={loading && !character.needsReconnect}
              noDataText={character.needsReconnect ? 'Nothing synced for this character.' : 'Awaiting first sync.'}
              emptyRowsText="No industry jobs running."
            />
          );
        })
      }
    </CharacterStripSection>
  );
}

function ReconnectNotice() {
  return (
    <Callout className="mx-3.5 my-2" label="Reconnect">
      This character is missing the industry scope —{' '}
      <a href="/settings/characters" className="underline text-name">
        reconnect it on the Characters page
      </a>{' '}
      to sync its jobs.
    </Callout>
  );
}
