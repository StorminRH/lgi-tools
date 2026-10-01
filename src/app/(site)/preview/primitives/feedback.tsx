'use client';

import { useEffect, useRef, useState } from 'react';
import { AccessGate } from '@/components/ui/access-gate';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LivePrice } from '@/components/ui/live-price';
import { LoadingLabel } from '@/components/ui/loading-label';
import { useLoadingToast } from '@/components/ui/loading-toast';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ReferenceGroup, Specimen, Variant } from './specimen';

const SAMPLE_PRICES = { low: '312.4M ISK', high: '314.1M ISK' } as const;

function LivePriceSample() {
  const [pending, setPending] = useState(false);
  const [level, setLevel] = useState<keyof typeof SAMPLE_PRICES>('low');
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const refresh = () => {
    setPending(true);
    timer.current = window.setTimeout(() => {
      setLevel((current) => (current === 'low' ? 'high' : 'low'));
      setPending(false);
      timer.current = null;
    }, 1400);
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <LivePrice value={SAMPLE_PRICES[level]} pending={pending} className="text-xl text-isk" />
      <Button variant="secondary" size="sm" disabled={pending} onClick={refresh}>
        Refresh sample
      </Button>
    </div>
  );
}

function SyncToastTrigger() {
  const [syncing, setSyncing] = useState(false);
  useLoadingToast(syncing);
  return (
    <Button variant="secondary" size="sm" onClick={() => setSyncing((current) => !current)}>
      {syncing ? 'Finish sync' : 'Start sync'}
    </Button>
  );
}

export function FeedbackGroup() {
  const [bannerVisible, setBannerVisible] = useState(true);

  return (
    <ReferenceGroup
      id="feedback"
      title="Feedback"
      intro="Notices, loading states, progress, and the live-value treatment."
    >
      <Specimen
        name="Banner"
        source="banner"
        note="Page-level platform notices. Info announces politely; warn is an alert. Either can be dismissible."
        wide
      >
        <div className="flex flex-col gap-2.5">
          {bannerVisible ? (
            <Banner tone="info" onDismiss={() => setBannerVisible(false)}>
              <strong className="font-medium text-name">v4.1 deployed</strong> — the primitive reference now lists every component.
            </Banner>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setBannerVisible(true)} className="self-start">
              Restore info banner
            </Button>
          )}
          <Banner tone="warn">
            <strong className="font-medium text-name">ESI degraded</strong> — prices may be stale up to 3h.
          </Banner>
        </div>
      </Specimen>

      <Specimen
        name="Callout"
        source="callout"
        note="An inline labelled warning beside the control it concerns."
      >
        <Callout label="Query">ME tops out at 10 for this blueprint.</Callout>
      </Specimen>

      <Specimen
        name="AccessGate"
        source="access-gate"
        note="Replaces gated content with a reason and the action that unlocks it."
      >
        <AccessGate
          blocked
          title="Scope needed"
          reason="Industry jobs need the esi-industry.read_character_jobs scope on this character."
          action={<Button size="sm">Re-authorise</Button>}
        >
          <span>Gated content</span>
        </AccessGate>
      </Specimen>

      <Specimen
        name="Skeleton + LoadingLabel"
        source="skeleton · loading-label"
        note="Shape-preserving Suspense fallbacks, and the plain text label for small loading slots."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            {[['w-2/5', 'w-16'], ['w-3/5', 'w-12'], ['w-1/3', 'w-20']].map(([left, right]) => (
              <div key={left} className="flex justify-between gap-3 border-b border-border-soft px-4 py-3 last:border-0">
                <Skeleton className={`h-3 ${left}`} />
                <Skeleton className={`h-3 ${right}`} />
              </div>
            ))}
          </Card>
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-12 w-full" />
            <LoadingLabel />
          </div>
        </div>
      </Specimen>

      <Specimen
        name="EmptyState"
        source="empty-state"
        note="The quiet row shown when a list section has nothing in it."
      >
        <Card className="overflow-hidden">
          <EmptyState>No active jobs on this character.</EmptyState>
        </Card>
      </Specimen>

      <Specimen
        name="ProgressBar"
        source="progress-bar"
        note="The default thin track for shares, and the EVE industry-blue tone reserved for job progress."
      >
        <div className="flex flex-col gap-4">
          <Variant label="default · 64%">
            <ProgressBar pct={64} />
          </Variant>
          <Variant label="evb · 38%">
            <ProgressBar pct={38} tone="evb" />
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="LivePrice"
        source="live-price"
        note="A pulse while a refresh is in flight, then a bright confirm flash when the new value lands."
      >
        <LivePriceSample />
      </Specimen>

      <Specimen
        name="Toast"
        source="toast · loading-toast"
        note="Glass toasts from the root Toaster. Long-running work goes through useLoadingToast, which shares one “Syncing…” toast."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => toast.success('Plan saved')}>Success</Button>
          <Button variant="secondary" size="sm" onClick={() => toast.info('Prices refresh every 15 minutes')}>Info</Button>
          <Button variant="secondary" size="sm" onClick={() => toast.warning('ESI is slow to respond')}>Warning</Button>
          <Button variant="secondary" size="sm" onClick={() => toast.error('Could not reach ESI')}>Error</Button>
          <SyncToastTrigger />
        </div>
      </Specimen>
    </ReferenceGroup>
  );
}
