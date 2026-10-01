import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Kbd } from '@/components/ui/kbd';
import { Breadcrumb } from '@/components/ui/page-head';
import { SectionLabel } from '@/components/ui/section-label';
import { StatusDot } from '@/components/ui/status-dot';
import { ChevronRightIcon, InboxIcon } from './icons';
import { PrototypeGroup, StateCell, VariantCard } from './gallery';

/* ── Keycaps, section labels, breadcrumbs ────────────────────────────── */

function Keys({ cap }: { cap: string }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 font-ui text-ui text-muted">
      Search <span className={cn('pt-kbd', cap)}>⌘</span><span className={cn('pt-kbd', cap)}>K</span>
      <span className="mx-1">·</span> close <span className={cn('pt-kbd', cap)}>esc</span>
    </p>
  );
}

function Crumbs({ separator }: { separator: 'chevron' | 'slash' }) {
  const sep = separator === 'chevron' ? <ChevronRightIcon size={13} /> : <span className="text-faint">/</span>;
  return (
    <nav aria-label="Breadcrumb" className="pt-crumbs">
      <a href="#labels">Industry</a>
      {sep}
      <a href="#labels">Planner</a>
      {sep}
      <span className="pt-crumb-current">Praxis</span>
    </nav>
  );
}

function LabelSet({ cap, eyebrow, separator }: { cap: string; eyebrow: string; separator: 'chevron' | 'slash' }) {
  return (
    <div className="flex flex-col gap-4">
      <StateCell label="keycaps"><Keys cap={cap} /></StateCell>
      <StateCell label="section label">
        <span className={cn('pt-eyebrow', eyebrow)}>
          {eyebrow === '' ? <span className="pt-eyebrow-dot" aria-hidden /> : null}
          Build materials
        </span>
      </StateCell>
      <StateCell label="breadcrumb"><Crumbs separator={separator} /></StateCell>
    </div>
  );
}

export function LabelsGroup() {
  return (
    <PrototypeGroup
      id="labels"
      title="Keycaps, labels, breadcrumbs"
      today="Every card shows the same Kbd shortcut, SectionLabel, and Breadcrumb. Only the look changes."
    >
      <VariantCard letter="Now" name="Terminal prefixes" pitch="The shipping Kbd, SectionLabel, and Breadcrumb: mono keycaps, a // prefixed uppercase label, and an lgi:// terminal path.">
        <div className="flex flex-col gap-4">
          <p className="font-ui text-ui text-muted">Search <Kbd>⌘</Kbd><Kbd>K</Kbd> · close <Kbd>esc</Kbd></p>
          <SectionLabel>Build materials</SectionLabel>
          <Breadcrumb crumb="industry / planner / praxis" />
        </div>
      </VariantCard>
      <VariantCard letter="A" name="Glass caps + dot" pitch="Raised glass keycaps, a sentence-case label led by a glowing gradient dot, and chevron crumbs ending in a pill.">
        <LabelSet cap="pt-kbd-a" eyebrow="" separator="chevron" />
      </VariantCard>
      <VariantCard letter="B" name="Flat caps + dash" pitch="Flat translucent caps and a gradient dash before the label. Quieter for dense toolbars.">
        <LabelSet cap="pt-kbd-b" eyebrow="pt-eyebrow-bar" separator="slash" />
      </VariantCard>
      <VariantCard letter="C" name="Outline caps + gradient text" pitch="Round outline caps and the brand gradient as the label colour, for page-level section starts.">
        <LabelSet cap="pt-kbd-c" eyebrow="pt-eyebrow-gradient" separator="chevron" />
      </VariantCard>
    </PrototypeGroup>
  );
}

/* ── Status lights + empty states ────────────────────────────────────── */

const LIGHTS = [
  { label: 'Online', tone: 'green' },
  { label: 'VIP', tone: 'orange' },
  { label: 'Offline', tone: 'neutral' },
] as const;

function Lights({ variant }: { variant: string }) {
  return (
    <div className="flex flex-wrap gap-5">
      {LIGHTS.map((light) => (
        <span key={light.label} className="inline-flex items-center gap-2 font-ui text-ui text-text" data-tone={light.tone}>
          <span className={cn('pt-led', variant, light.tone === 'neutral' && 'pt-led-still')} />
          {light.label}
        </span>
      ))}
    </div>
  );
}

const EMPTY_TEXT = 'No active jobs on this character.';

function IllustratedEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 py-3 text-center">
      <span className="pt-empty-icon"><InboxIcon size={20} /></span>
      <span className="font-ui text-ui text-muted">{EMPTY_TEXT}</span>
    </div>
  );
}

function MinimalEmpty() {
  return (
    <div className="flex items-center gap-3 px-1 py-1">
      <InboxIcon size={16} className="shrink-0 text-faint" />
      <span className="font-ui text-ui text-muted">{EMPTY_TEXT}</span>
    </div>
  );
}

function DashedEmpty() {
  return (
    <div className="pt-empty-dashed px-4 py-3 font-ui text-ui text-muted">{EMPTY_TEXT}</div>
  );
}

export function StatusGroup() {
  return (
    <PrototypeGroup
      id="status"
      title="Status lights + empty states"
      today="Every card shows the same three StatusDot states and the same EmptyState line. Only the look and motion change."
    >
      <VariantCard letter="Now" name="Stepped blink + dim row" pitch="The shipping StatusDot and EmptyState: a stepped on/off blink, and a near-invisible dark row.">
        <div className="flex flex-col gap-4">
          <div className="flex gap-5 font-ui text-ui text-text">
            <span className="inline-flex items-center gap-2"><StatusDot state="online" /> Online</span>
            <span className="inline-flex items-center gap-2"><StatusDot state="vip" /> VIP</span>
            <span className="inline-flex items-center gap-2"><StatusDot state="offline" /> Offline</span>
          </div>
          <Card className="overflow-hidden"><EmptyState>{EMPTY_TEXT}</EmptyState></Card>
        </div>
      </VariantCard>
      <VariantCard letter="A" name="Radar ping + icon disc" pitch="A smooth radar ring for live states, and the empty line centred under a glowing icon disc.">
        <div className="flex flex-col gap-4">
          <Lights variant="pt-led-ping" />
          <IllustratedEmpty />
        </div>
      </VariantCard>
      <VariantCard letter="B" name="Breathing glow + inline" pitch="A soft halo that breathes, and the empty line led by a small inbox icon.">
        <div className="flex flex-col gap-4">
          <Lights variant="pt-led-breathe" />
          <MinimalEmpty />
        </div>
      </VariantCard>
      <VariantCard letter="C" name="Ring light + dashed slot" pitch="A ringed light (hollow when offline), and the empty line inside a dashed rounded slot.">
        <div className="flex flex-col gap-4">
          <Lights variant="pt-led-ring" />
          <DashedEmpty />
        </div>
      </VariantCard>
    </PrototypeGroup>
  );
}
