'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { EveSignInButton } from '../account/LoginButton';
import { readoutSurface } from '../board/SectionBody';

const SECTIONS: readonly { label: string; href: string | null }[] = [
  { label: 'Profiles', href: '/industry' },
  { label: 'Plans & templates', href: '/industry/templates' },
  { label: 'Active jobs', href: '/jobs' },
  { label: 'Research', href: null },
  { label: 'Tracked builds', href: null },
];

/**
 * The industry workspace's areas. Areas that are not built yet are shown as
 * planned, not as links that lead nowhere.
 */
export function WorkspaceNav() {
  return (
    <nav aria-label="Industry workspace">
      <ul className="flex flex-wrap items-center gap-1.5">
        {SECTIONS.map((section) => (
          <li key={section.label}>
            {section.href === null ? (
              <span className="inline-flex items-center gap-1.5 rounded-ctl px-2.5 py-[5px] font-ui text-nav text-faint">
                {section.label}
                <span className="font-data text-label uppercase tracking-label">planned</span>
              </span>
            ) : (
              <Link
                href={section.href}
                aria-current={section.href === '/industry' ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center rounded-ctl px-2.5 py-[5px] font-ui text-nav no-underline transition-colors',
                  section.href === '/industry'
                    ? 'bg-row-on text-name shadow-btn-bezel'
                    : 'text-muted hover:text-isk',
                )}
              >
                {section.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton label="Loading production profiles" className="h-10 w-64 rounded-full" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-x-10">
        <div className="flex gap-4 lg:flex-col lg:gap-5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-full lg:size-14 xl:size-16" />
              <div className="hidden min-w-0 flex-1 flex-col gap-2 lg:flex">
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-2.5 w-2/5" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={cn(readoutSurface, 'flex flex-col gap-2 px-3.5 py-3')}>
                <Skeleton className="h-2.5 w-1/2" />
                <Skeleton className="h-5 w-1/3" />
              </div>
            ))}
          </div>
          <Skeleton className="h-48 w-full rounded-card" />
        </div>
      </div>
    </div>
  );
}

function IntroCard({ children }: { children: ReactNode }) {
  return (
    <div className={cn(readoutSurface, 'flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between')}>
      {children}
    </div>
  );
}

const INTRO =
  'A production profile describes how you actually build: which characters are on the team, who runs reactions, components and final assembly, and where.';

export function SignedOutWorkspace() {
  return (
    <IntroCard>
      <div className="flex max-w-xl flex-col gap-1.5">
        <h2 className="font-display text-h3 font-bold text-name">Production profiles</h2>
        <p className="text-ui text-muted">
          {INTRO} Sign in with EVE to build one from your characters&apos; real skills, slots and structures.
          Blueprint planning below works without signing in.
        </p>
      </div>
      <EveSignInButton callbackURL="/industry" />
    </IntroCard>
  );
}

export function FirstProfile({ onCreate, busy }: { onCreate: () => void; busy: boolean }) {
  return (
    <IntroCard>
      <div className="flex max-w-xl flex-col gap-1.5">
        <h2 className="font-display text-h3 font-bold text-name">Create your first production profile</h2>
        <p className="text-ui text-muted">
          {INTRO} Research and plans will use the profile you choose. Nothing has to be complete to start;
          anything missing is listed.
        </p>
      </div>
      <Button variant="primary" onClick={onCreate} disabled={busy} className="shrink-0">
        Create profile
      </Button>
    </IntroCard>
  );
}
