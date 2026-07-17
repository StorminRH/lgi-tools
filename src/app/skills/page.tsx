import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { auth } from '@/features/auth/auth';
import { LinkCharacterButton } from '@/features/auth/components/LinkCharacterButton';
import { toPanelCharacter } from '@/features/auth/panel-character';
import { listLinkedCharacters } from '@/features/auth/linked-characters';
import { SkillQueuePanel } from '@/features/skill-queue/components/SkillQueuePanel';
import { skillsPageSettings } from '@/features/skill-queue/page-settings';
import { canSyncSkillQueue } from '@/features/skill-queue/sync-eligibility';
import { cookieNameFor, readPreferenceCookieValue, stripDimmedDef } from '@/lib/preferences';

async function SkillsContent() {
  // Session-gated (any signed-in pilot), the /characters precedent: signed
  // out lands on the homepage with the login notice. The hole reads the
  // session + the linked-character list per request; the queue data itself
  // arrives client-side over the Convex websocket.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  const characters = await listLinkedCharacters(session.user.id);
  // The strip's dimmed set, read from its ssrReadable cookie mirror inside the
  // hole (the /sites initialView idiom) so a reload's first paint already hides
  // dimmed cards instead of flashing all-lit until the preferences GET resolves.
  const stripDef = stripDimmedDef(skillsPageSettings.strip.surfaceId);
  const initialDimmed = readPreferenceCookieValue(
    (await cookies()).get(cookieNameFor(stripDef))?.value,
    stripDef,
  );
  // Per-character scope gate: each card that can't sync its skill queue blocks
  // itself behind an in-place grant, while granted characters still show. The
  // scope health is derived per character at the app layer (toPanelCharacter →
  // canSyncSkillQueue); the page composes the grant control + reason and passes
  // them down, so the panel and gate primitive stay free of auth/scope imports.
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
  return (
    <LoadingLabel />
  );
}

/**
 * Live skill queues across the pilot's linked characters (3.4.7) — the first
 * Convex tracker. The page container prerenders as the static shell; the
 * session + character-list read is a request-time dynamic hole, and the
 * queues stream in reactively from Convex inside the client island.
 */
export default function SkillsPage() {
  return (
    <PageShell>
      <div className="flex flex-col items-center pb-20">
        <div className="w-full max-w-[760px]">
          <PageHead
            crumb="skills"
            title="Skill Queues"
            subtitle="Live training queues for every linked character · synced from ESI on view"
          />
        </div>
        <div className="w-full max-w-[760px]">
          <Suspense fallback={<SkillsLoading />}>
            <SkillsContent />
          </Suspense>
        </div>
      </div>
    </PageShell>
  );
}
