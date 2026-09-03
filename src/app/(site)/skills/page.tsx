import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CharacterPanelSkeleton } from '@/components/composition/CharacterPanelSkeleton';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { auth } from '@/platform/auth/auth';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { toPanelCharacter } from '@/platform/auth/panel-character';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { SkillQueuePanel } from '@/features/skill-queue/components/SkillQueuePanel';
import { skillsPageSettings } from '@/features/skill-queue/page-settings';
import { canSyncSkillQueue } from '@/features/skill-queue/sync-eligibility';
import { cookieNameFor, readPreferenceCookieValue, stripDimmedDef } from '@/lib/preferences';

async function SkillsContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  const characters = await listLinkedCharacters(session.user.id);
  const stripDef = stripDimmedDef(skillsPageSettings.strip.surfaceId);
  const initialDimmed = readPreferenceCookieValue(
    (await cookies()).get(cookieNameFor(stripDef))?.value,
    stripDef,
  );
  return (
    <SkillQueuePanel
      characters={characters.map((character) => toPanelCharacter(character, canSyncSkillQueue))}
      reconnectAction={
        <LinkCharacterButton label="Grant skill access" emphasis="reconnect" callbackURL="/skills" />
      }
      reconnectReason="Skill access lets the site read this character's training queue and skills."
      strip={skillsPageSettings.strip}
      initialDimmed={initialDimmed}
    />
  );
}

function SkillsLoading() {
  return <CharacterPanelSkeleton label="Loading skill queues" />;
}

export default function SkillsPage() {
  return (
    <PageShell mode="reading">
      <div className="flex w-full flex-col items-center pb-20">
        <PageHead
          crumb="skills"
          title="Skill Queues"
          subtitle="Live training queues for every linked character · synced from ESI on view"
        />
        <div className="w-full">
          <Suspense fallback={<SkillsLoading />}>
            <SkillsContent />
          </Suspense>
        </div>
      </div>
    </PageShell>
  );
}
