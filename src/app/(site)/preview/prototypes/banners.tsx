'use client';

import { useState, type ReactNode } from 'react';
import { Banner } from '@/components/ui/banner';
import { AlertIcon, CloseIcon, InfoIcon } from './icons';
import { PrototypeGroup, VariantCard } from './gallery';

/*
 * Every card renders the Banner primitive's two tones with the same copy:
 * a dismissible info notice and a warn notice. Only the look changes.
 */

const NOTICES = [
  { tone: 'info', hue: 'teal', title: 'v4.1 deployed', body: 'the UI system is ready.', dismissible: true },
  { tone: 'warn', hue: 'orange', title: 'ESI degraded', body: 'prices may be stale up to 3h.', dismissible: false },
] as const;

type Notice = (typeof NOTICES)[number];

function Dismiss() {
  return (
    <button type="button" className="pt-dismiss" aria-label="Dismiss notice">
      <CloseIcon size={14} />
    </button>
  );
}

function Icon({ notice }: { notice: Notice }) {
  return notice.tone === 'info' ? <InfoIcon size={16} /> : <AlertIcon size={16} />;
}

function Copy({ notice }: { notice: Notice }) {
  return (
    <p className="min-w-0 flex-1 pt-banner-body">
      <span className="pt-banner-title">{notice.title}</span> — {notice.body}
    </p>
  );
}

/** One banner in a variant's look: `lead` is the dot or icon treatment the variant uses. */
function GlassBanner({ notice, className, lead }: { notice: Notice; className: string; lead: 'icon' | 'dot' | 'none' }) {
  return (
    <div className={className} data-tone={notice.hue} role="status">
      {lead === 'icon' ? <span className="pt-banner-icon"><Icon notice={notice} /></span> : null}
      {lead === 'dot' ? <span className="pt-pill-dot" /> : null}
      <Copy notice={notice} />
      {notice.dismissible ? <Dismiss /> : null}
    </div>
  );
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2.5">{children}</div>;
}

function Variant({ className, lead }: { className: string; lead: 'icon' | 'dot' | 'none' }) {
  return (
    <Stack>
      {NOTICES.map((notice) => <GlassBanner key={notice.tone} notice={notice} className={className} lead={lead} />)}
    </Stack>
  );
}

function CurrentBanners() {
  const [visible, setVisible] = useState(true);
  return (
    <Stack>
      {visible ? (
        <Banner tone="info" onDismiss={() => setVisible(false)}>
          <strong className="font-medium text-name">v4.1 deployed</strong> — the UI system is ready.
        </Banner>
      ) : null}
      <Banner tone="warn">
        <strong className="font-medium text-name">ESI degraded</strong> — prices may be stale up to 3h.
      </Banner>
    </Stack>
  );
}

export function BannersGroup() {
  return (
    <PrototypeGroup
      id="banners"
      title="System banners"
      today="Every card shows the same two Banner notices: a dismissible info and a warn. Only the look changes."
      layout="stack"
    >
      <VariantCard letter="Now" name="Tone slab" pitch="The shipping Banner: a dim solid tone slab, a status dot, and a text × dismiss.">
        <CurrentBanners />
      </VariantCard>
      <VariantCard letter="A" name="Glass bar" pitch="A frosted bar lit from the left edge in the tone colour, an icon disc, and a round dismiss that spins on hover.">
        <Variant className="pt-banner-a pt-glass" lead="icon" />
      </VariantCard>
      <VariantCard letter="B" name="Floating capsule" pitch="A fully rounded floating capsule that echoes the header, with a live ping on the status dot.">
        <Variant className="pt-banner-b pt-glass" lead="dot" />
      </VariantCard>
      <VariantCard letter="C" name="Accent rail" pitch="A glass card with a glowing rounded tone rail down the left side instead of a tinted fill.">
        <Variant className="pt-banner-c pt-glass" lead="none" />
      </VariantCard>
      <VariantCard letter="D" name="Orbiting edge" pitch="Neutral glass with a tone light slowly orbiting the border. Draws the eye without a coloured slab.">
        <Variant className="pt-banner-d pt-glass" lead="icon" />
      </VariantCard>
      <VariantCard letter="E" name="Tinted frost" pitch="The current tone slab rebuilt as frosted glass: translucent tone fill, lit top edge, and an icon in place of the dot.">
        <Variant className="pt-banner-e pt-glass" lead="icon" />
      </VariantCard>
    </PrototypeGroup>
  );
}
