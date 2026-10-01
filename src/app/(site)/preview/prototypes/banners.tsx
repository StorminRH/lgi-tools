'use client';

import { useState, type ReactNode } from 'react';
import { Banner } from '@/components/ui/banner';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon, SparkIcon } from './icons';
import { PrototypeGroup, VariantCard } from './gallery';

type Notice = {
  tone: 'teal' | 'orange' | 'red' | 'green';
  title: string;
  body: string;
  action: string;
  time: string;
  icon: ReactNode;
};

const ESI_NOTICE: Notice = { tone: 'orange', title: 'ESI degraded', body: 'Prices may be up to 3 hours stale while CCP recovers.', action: 'Status page', time: '14m ago', icon: <AlertIcon size={16} /> };

const NOTICES: readonly Notice[] = [
  { tone: 'teal', title: 'v4.1 deployed', body: 'The UI system is ready, with glass primitives across every tool.', action: 'What’s new', time: '2m ago', icon: <InfoIcon size={16} /> },
  ESI_NOTICE,
  { tone: 'red', title: 'Sign-in failing', body: 'EVE SSO is returning errors. Existing sessions keep working.', action: 'Retry', time: 'just now', icon: <AlertIcon size={16} /> },
];

function Dismiss() {
  return (
    <button type="button" className="pt-dismiss" aria-label="Dismiss">
      <CloseIcon size={14} />
    </button>
  );
}

function GlassBar({ notice }: { notice: Notice }) {
  return (
    <div className="pt-banner-a pt-glass" data-tone={notice.tone} role="status">
      <span className="pt-banner-icon">{notice.icon}</span>
      <p className="min-w-0 flex-1 pt-banner-body">
        <span className="pt-banner-title">{notice.title}</span> — {notice.body}
      </p>
      <a href="#banners" className="pt-banner-action">{notice.action}</a>
      <Dismiss />
    </div>
  );
}

function Capsule({ notice }: { notice: Notice }) {
  return (
    <div className="flex justify-center">
      <div className="pt-banner-b pt-glass" data-tone={notice.tone} role="status">
        <span className="pt-pill-dot" />
        <span className="truncate pt-banner-body">
          <span className="pt-banner-title">{notice.title}</span> · {notice.body}
        </span>
        <a href="#banners" className="pt-banner-b-cta">{notice.action}</a>
      </div>
    </div>
  );
}

function AccentRail({ notice }: { notice: Notice }) {
  return (
    <div className="pt-banner-c pt-glass" data-tone={notice.tone} role="status">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="pt-banner-title">{notice.title}</span>
          <span className="pt-banner-time">{notice.time}</span>
        </div>
        <p className="pt-banner-body">{notice.body}</p>
        <a href="#banners" className="pt-banner-action mt-1 self-start">{notice.action} →</a>
      </div>
      <Dismiss />
    </div>
  );
}

function ReleaseHero() {
  return (
    <div className="pt-banner-d pt-glass" data-tone="teal" role="status">
      <span className="pt-banner-icon size-11"><SparkIcon size={20} /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-ui text-label font-medium text-aurora">New release</span>
        <span className="font-ui text-h3 font-semibold text-name">v4.1 is live — glass everywhere</span>
        <span className="pt-banner-body">Fields, menus, and pills now share the frosted look. Your saved plans are untouched.</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="pt-ghost-btn">Later</button>
        <button type="button" className="pt-cta">See what’s new</button>
      </div>
    </div>
  );
}

function RecoveryCard({ notice, progress }: { notice: Notice; progress: string }) {
  return (
    <div className="pt-banner-e pt-glass-dense" data-tone={notice.tone} role="status">
      <span className="pt-banner-icon">{notice.tone === 'green' ? <CheckIcon size={16} /> : notice.icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="pt-banner-title">{notice.title}</span>
        <span className="pt-banner-body">{notice.body}</span>
        <span className="pt-banner-time mt-1">{progress}</span>
      </div>
      <Dismiss />
      <span className="pt-banner-e-progress" aria-hidden />
    </div>
  );
}

function CurrentBanners() {
  const [visible, setVisible] = useState(true);
  return (
    <div className="flex flex-col gap-2.5">
      {visible ? (
        <Banner tone="info" onDismiss={() => setVisible(false)}>
          <strong className="font-medium text-name">v4.1 deployed</strong> — the UI system is ready.
        </Banner>
      ) : null}
      <Banner tone="warn">
        <strong className="font-medium text-name">ESI degraded</strong> — prices may be stale up to 3h.
      </Banner>
    </div>
  );
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

export function BannersGroup() {
  return (
    <PrototypeGroup
      id="banners"
      title="System banners"
      today="Today: a dim solid tone slab with a status dot and a text × dismiss. Info and warn only."
      layout="stack"
    >
      <VariantCard letter="Now" name="Tone slab" pitch="The shipping Banner.">
        <CurrentBanners />
      </VariantCard>
      <VariantCard letter="A" name="Glass bar" pitch="A frosted bar lit from the left edge in the tone colour, an icon disc, an inline action, and a round dismiss that spins.">
        <Stack>{NOTICES.map((notice) => <GlassBar key={notice.title} notice={notice} />)}</Stack>
      </VariantCard>
      <VariantCard letter="B" name="Floating capsule" pitch="A centred one-line capsule that echoes the header, with a live ping and a pill action. For global notices.">
        <Stack>{NOTICES.map((notice) => <Capsule key={notice.title} notice={notice} />)}</Stack>
      </VariantCard>
      <VariantCard letter="C" name="Accent rail" pitch="A glass card with a glowing rounded rail, title, timestamp, and body. Room for longer incident text.">
        <div className="grid gap-3 md:grid-cols-3">{NOTICES.map((notice) => <AccentRail key={notice.title} notice={notice} />)}</div>
      </VariantCard>
      <VariantCard letter="D" name="Release hero" pitch="For announcements: a light orbits the border, with a primary gradient CTA. Use sparingly.">
        <ReleaseHero />
      </VariantCard>
      <VariantCard letter="E" name="Recovery card" pitch="For incidents in progress: a dense glass card whose bottom bar tracks recovery, then turns green.">
        <div className="grid gap-3 md:grid-cols-2">
          <RecoveryCard notice={ESI_NOTICE} progress="Recovering · 6 of 9 hubs synced" />
          <RecoveryCard
            notice={{ tone: 'green', title: 'Prices recovered', body: 'All hubs synced 2 minutes ago.', action: '', time: '', icon: null }}
            progress="Dismisses in 8s"
          />
        </div>
      </VariantCard>
    </PrototypeGroup>
  );
}
