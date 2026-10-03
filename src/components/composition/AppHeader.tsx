import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { AppHeaderShell } from '@/components/composition/AppHeaderShell';
import { EveStatusPanel, EveStatusPanelFallback } from '@/components/composition/EveStatusPanel';
import { eveStatusSections } from '@/components/composition/server-status-presentation';
import {
  HeldServerStatus,
  ServerStatus,
  ServerStatusFallback,
} from '@/components/composition/ServerStatus';
import { floatSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { getEsiHealth } from '@/composition/esi-health';
import { getIngestedSdeBuild, getNavServerStatus } from '@/data/eve-status/queries';
import type { ServerStatus as ServerStatusValue } from '@/data/eve-status/types';
import { getSiteSearchIndex } from '@/features/wormhole-sites/queries';

async function NavEveStatusPanel({ status }: { status: ServerStatusValue }) {
  const [sde, esi] = await Promise.all([getIngestedSdeBuild(), getEsiHealth()]);
  return <EveStatusPanel sections={eveStatusSections({ status, sde, esi })} />;
}

async function NavServerStatus() {
  await connection();
  const status = await getNavServerStatus();
  return (
    <HeldServerStatus>
      <ServerStatus status={status}>
        <Suspense fallback={<EveStatusPanelFallback />}>
          <NavEveStatusPanel status={status} />
        </Suspense>
      </ServerStatus>
    </HeldServerStatus>
  );
}

export async function AppHeader() {
  const siteIndex = await getSiteSearchIndex();

  return (
    <header
      className={cn(
        floatSurface,
        'app-header sticky top-3 z-sticky mx-3 mt-3 flex h-[56px] items-center gap-1 rounded-full pl-5 pr-2 text-ui max-lg:h-auto max-lg:flex-wrap max-lg:rounded-sheet max-lg:py-1.5 max-lg:pr-1.5',
      )}
    >
      <div className="flex items-center shrink-0 pr-1">
        <Link
          href="/"
          className="font-data font-extrabold text-lead tracking-copy uppercase text-name inline-flex items-center"
        >
          <span className="text-isk">[</span>
          <span className="px-[2px]">LGI</span>
          <span className="text-isk">]</span>
          <span className="text-muted font-normal">.tools</span>
        </Link>
      </div>
      <AppHeaderShell
        siteIndex={siteIndex}
        serverStatusSlot={
          <Suspense fallback={<ServerStatusFallback />}>
            <NavServerStatus />
          </Suspense>
        }
      />
    </header>
  );
}
