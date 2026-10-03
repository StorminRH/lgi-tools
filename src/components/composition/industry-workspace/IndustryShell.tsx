'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, startTransition, useEffect, useState, ViewTransition } from 'react';
import { cn } from '@/components/ui/cn';
import { tabItem, tabSpotlight, tabTrack } from '@/components/ui/tabs';
import { SidePanel } from '@/components/ui/side-panel';
import { refreshAvailableStructures } from '@/features/industry-planner/use-available-structures';
import { createClientStore, useClientStore } from '@/lib/client-store';
import { setStructuresPanelOpen } from './structures-panel';

/**
 * The industry planner is one workspace: Profiles, the Planner and Active
 * jobs are routes under one persistent shell, so moving between them is a
 * client transition that keeps each section where it was left.
 */

type Section = 'profiles' | 'planner' | 'jobs';

const TAB_TRANSITION = ['industry-tab'];
const EMPTY_PLANNER = '/industry/planner';

/** The blueprint the planner last showed, so its tab returns to it. */
const lastPlanner = createClientStore<string | null>(null);

function sectionOf(pathname: string): Section {
  if (pathname === '/industry/jobs') return 'jobs';
  if (pathname === EMPTY_PLANNER || /^\/industry\/\d+$/.test(pathname)) return 'planner';
  return 'profiles';
}

function Tab({
  href,
  active,
  prefetch,
  children,
}: {
  href: string;
  active: boolean;
  prefetch?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      aria-current={active ? 'page' : undefined}
      transitionTypes={TAB_TRANSITION}
      className={cn(tabItem, 'isolate aria-[current=page]:text-isk')}
    >
      {children}
      {active ? (
        <ViewTransition name="industry-tab-indicator" share="morph" default="none">
          <span aria-hidden className={cn(tabSpotlight, 'absolute inset-0 -z-10')} />
        </ViewTransition>
      ) : null}
    </Link>
  );
}

function NavFrame({ active, plannerHref }: { active: Section | null; plannerHref: string }) {
  return (
    <nav aria-label="Industry workspace sections" className={cn(tabTrack, 'self-start')}>
      <Tab href="/industry" active={active === 'profiles'}>
        Profiles
      </Tab>
      {/* From inside the planner, its tab goes back to the search. A blueprint
          it returns to is prefetched whole, its cached plan included. */}
      <Tab
        href={active === 'planner' ? EMPTY_PLANNER : plannerHref}
        active={active === 'planner'}
        prefetch={active !== 'planner' && plannerHref !== EMPTY_PLANNER ? true : undefined}
      >
        Planner
      </Tab>
      <Tab href="/industry/jobs" active={active === 'jobs'}>
        Active jobs
      </Tab>
    </nav>
  );
}

export function IndustryNav() {
  const active = sectionOf(usePathname());
  const plannerHref = useClientStore(lastPlanner) ?? EMPTY_PLANNER;
  return <NavFrame active={active} plannerHref={plannerHref} />;
}

/** The tab bar before the route is known, so the static shell carries it. */
export function IndustryNavFallback() {
  return <NavFrame active={null} plannerHref={EMPTY_PLANNER} />;
}

/** Records the blueprint on screen, or the search without one, as where the Planner tab returns. */
export function RememberPlanner({ blueprintTypeId }: { blueprintTypeId?: number }) {
  useEffect(() => {
    lastPlanner.set(blueprintTypeId === undefined ? EMPTY_PLANNER : `/industry/${blueprintTypeId}`);
  }, [blueprintTypeId]);
  return null;
}

const SECTION_MOTION = { 'industry-tab': 'industry-section', default: 'none' };

/** One section's content, faded in and out as the tabs change. */
export function IndustrySection({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={SECTION_MOTION} exit={SECTION_MOTION} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}

/**
 * The account's structures, open over any section when the address asks for
 * them. Closing it refreshes the structures every section reads.
 */
export function StructuresDrawer({ children }: { children: ReactNode }) {
  const open = useSearchParams().get('panel') === 'structures';
  const [visited, setVisited] = useState(open);

  useEffect(() => {
    if (open) startTransition(() => setVisited(true));
    else if (visited) refreshAvailableStructures();
  }, [open, visited]);

  if (!open && !visited) return null;
  return (
    <SidePanel
      open={open}
      onOpenChange={setStructuresPanelOpen}
      title="Structures"
      finalFocus={() => {
        const trigger = document.querySelector<HTMLButtonElement>('[data-structures-trigger]');
        return trigger?.getClientRects().length ? trigger : true;
      }}
    >
      {children}
    </SidePanel>
  );
}
