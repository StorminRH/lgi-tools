'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { readoutSurface } from '@/components/ui/section-panel';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { EveSignInButton } from '../account/LoginButton';

export function WorkspaceSkeleton() {
  return (
    <SkeletonGroup
      label="Loading production profiles"
      className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-x-10"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <Skeleton className="h-10 w-64 rounded-full" />
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
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-48 w-full rounded-card" />
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
    </SkeletonGroup>
  );
}

/** The industry sections' intro: what the section is for, and the one thing to do next. */
export function IntroCard({ children }: { children: ReactNode }) {
  return (
    <div className={cn(readoutSurface, 'flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between')}>
      {children}
    </div>
  );
}

const PURPOSE = 'Profiles give the planner more accurate pricing for your supply chain.';
const STEPS = ['Add characters', 'Add structures', 'Simulate a build'] as const;

function IntroBody({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-h3 font-bold text-name">{title}</h2>
        <p className="text-ui text-muted">{PURPOSE}</p>
      </div>
      <ol className="flex flex-wrap gap-x-5 gap-y-2">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-2 font-ui text-ui text-text">
            <span
              aria-hidden
              className="inline-flex size-5 items-center justify-center rounded-full bg-isk/[0.12] font-data text-micro text-isk tabular-nums"
            >
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SignedOutWorkspace() {
  return (
    <IntroCard>
      <IntroBody title="Production profiles" />
      <EveSignInButton callbackURL="/industry" />
    </IntroCard>
  );
}

export function FirstProfile({ onCreate, busy }: { onCreate: () => void; busy: boolean }) {
  return (
    <IntroCard>
      <IntroBody title="Create your first production profile" />
      <Button variant="primary" onClick={onCreate} disabled={busy} className="shrink-0">
        Create profile
      </Button>
    </IntroCard>
  );
}
