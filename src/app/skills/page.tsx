import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageShell } from '@/components/ui/page-shell';
import { auth } from '@/features/auth/auth';
import { toPanelCharacter } from '@/features/auth/panel-character';
import { listLinkedCharacters } from '@/features/auth/queries';
import { SkillQueuePanel } from '@/features/skill-queue/components/SkillQueuePanel';
import { canSyncSkillQueue } from '@/features/skill-queue/sync-eligibility';

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
  return (
    <SkillQueuePanel
      characters={characters.map((character) => toPanelCharacter(character, canSyncSkillQueue))}
    />
  );
}

function SkillsLoading() {
  return (
    <LoadingLabel />
  );
}

// Live skill queues across the pilot's linked characters (3.4.7) — the first
// Convex tracker. The page container prerenders as the static shell; the
// session + character-list read is a request-time dynamic hole, and the
// queues stream in reactively from Convex inside the client island.
export default function SkillsPage() {
  return (
    <PageShell>
      <div className="flex flex-col items-center pt-12 pb-20">
        <header className="w-full max-w-[760px] mb-6 pb-4 border-b border-border-soft">
          <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
            Skill Queues
          </div>
          <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
            Live training queues for every linked character · synced from ESI on view
          </div>
        </header>
        <div className="w-full max-w-[760px]">
          <Suspense fallback={<SkillsLoading />}>
            <SkillsContent />
          </Suspense>
        </div>
      </div>
    </PageShell>
  );
}
