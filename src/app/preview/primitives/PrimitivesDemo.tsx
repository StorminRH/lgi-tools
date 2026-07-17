'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CopyButton } from '@/components/ui/copy-button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Pagination } from '@/components/ui/pagination';
import { RadioGroup } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';

function DemoSection({
  index,
  title,
  why,
  children,
}: {
  index: string;
  title: string;
  why: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-mono text-label tracking-wide uppercase text-isk-sub">
          {index} · {title}
        </h2>
        <p className="mt-1 max-w-[760px] font-mono text-label leading-relaxed text-faint">{why}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Renders the primitives demo surface; this component owns local presentation and interaction
 * wiring while callers own domain data.
 */
export function PrimitivesDemo() {
  const [checks, setChecks] = useState({ gas: true, ore: true, shattered: false });
  const [basis, setBasis] = useState('sell');
  const [unit, setUnit] = useState('isk');
  const [bannerVisible, setBannerVisible] = useState(true);
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmTriggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="flex flex-col gap-9 pb-16">
      <DemoSection
        index="01"
        title="Field + Input + Textarea"
        why="One label, hint, and error vocabulary around the shared engraved controls."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Structure name" hint="Shown in the build-location picker">
            <Input defaultValue="Sotiyo — Deklein" />
          </Field>
          <Field label="ESI callback URL" error="Must start with https://">
            <Input defaultValue="htp://lgi.tools/api" className="border-pill-red-border" />
          </Field>
          <Field label="Feedback" hint="Markdown not supported · 500 char max">
            <Textarea
              rows={3}
              defaultValue="The industry planner saved me 40M ISK on a Praxis batch."
            />
          </Field>
        </div>
      </DemoSection>

      <DemoSection
        index="02"
        title="Checkbox + Radio group"
        why="Controlled choice primitives with the same engraved-well language as text fields."
      >
        <div className="flex flex-wrap gap-8">
          <div className="flex flex-col gap-2.5">
            {([
              ['gas', 'Include gas sites'],
              ['ore', 'Include ore sites'],
              ['shattered', 'Show shattered systems'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2.5 text-ui text-text">
                <Checkbox
                  checked={checks[key]}
                  onCheckedChange={(checked) => setChecks((current) => ({ ...current, [key]: checked }))}
                  label={label}
                />
                {label}
              </label>
            ))}
          </div>
          <RadioGroup
            label="Price basis"
            value={basis}
            onValueChange={setBasis}
            options={[
              { value: 'sell', label: 'Price basis: Jita sell' },
              { value: 'buy', label: 'Price basis: Jita buy' },
              { value: 'average', label: 'Price basis: 5-day average' },
            ]}
          />
        </div>
      </DemoSection>

      <DemoSection
        index="03"
        title="Segmented control"
        why="A raised selected bezel inside the inset track; link mode preserves URL-driven state."
      >
        <SegmentedControl
          label="Display unit"
          value={unit}
          onChange={setUnit}
          options={[
            { value: 'isk', label: 'ISK' },
            { value: 'volume', label: 'm³' },
            { value: 'units', label: 'Units' },
          ]}
        />
      </DemoSection>

      <DemoSection
        index="04"
        title="Tabs"
        why="Keyboard-operable content sections with a restrained ISK active indicator."
      >
        <Card className="px-4 pt-1">
          <Tabs
            label="Build detail"
            defaultValue="plan"
            tabs={[
              { value: 'plan', label: 'Build plan', content: '3× Praxis · ME 8 · estimated margin +41.2M ISK' },
              { value: 'materials', label: 'Materials', content: 'Raw and intermediate material demand.' },
              { value: 'market', label: 'Market fit', content: 'Jita depth and sale velocity.' },
              { value: 'history', label: 'History', content: 'Recent saved runs and outcomes.' },
            ]}
          />
        </Card>
      </DemoSection>

      <DemoSection
        index="05"
        title="Tooltip"
        why="Supplemental hover/focus assistance only; touch-critical question-mark help remains Popover."
      >
        <Tooltip content="How fresh the Jita snapshot behind this value is. High means synced within the last hour.">
          <button type="button" className="w-fit border-b border-dotted border-border-active text-ui text-text">
            Price confidence
          </button>
        </Tooltip>
      </DemoSection>

      <DemoSection
        index="06"
        title="Kbd + CopyButton"
        why="Semantic shortcut caps and a selectable value well with clipboard success and failure states."
      >
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-ui text-muted">
            Focus search <Kbd>⌘</Kbd><Kbd>K</Kbd> · close <Kbd>esc</Kbd>
          </span>
          <CopyButton value="312,400,000 ISK" />
          <CopyButton value="J115405" />
        </div>
      </DemoSection>

      <DemoSection
        index="07"
        title="Skeleton"
        why="Shape-preserving Suspense fallbacks with animation disabled under reduced motion."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            {[['w-2/5', 'w-16'], ['w-3/5', 'w-12'], ['w-1/3', 'w-20']].map(([left, right]) => (
              <div key={left} className="flex justify-between gap-3 border-b border-border-soft px-4 py-3 last:border-0">
                <Skeleton className={`h-3 ${left}`} />
                <Skeleton className={`h-3 ${right}`} />
              </div>
            ))}
          </Card>
          <Card className="flex flex-col gap-2.5 p-4">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-16 w-full" />
          </Card>
        </div>
      </DemoSection>

      <DemoSection
        index="08"
        title="System banner"
        why="Page-level platform notices, intentionally not wired to a real status feed in this session."
      >
        <div className="flex flex-col gap-2.5">
          {bannerVisible ? (
            <Banner tone="info" onDismiss={() => setBannerVisible(false)}>
              <strong className="font-medium text-name">v3.8 deployed</strong> — the UI system is ready.
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
      </DemoSection>

      <DemoSection
        index="09"
        title="Pagination"
        why="Honest result counts beside compact page controls, with link and callback navigation support."
      >
        <Pagination page={page} pageCount={12} total={284} pageSize={25} onPageChange={setPage} />
      </DemoSection>

      <DemoSection
        index="10"
        title="ConfirmDialog"
        why="One destructive-action shell with focus restoration, busy/error slots, and caller-owned confirmation content."
      >
        <Button ref={confirmTriggerRef} variant="danger" size="sm" onClick={() => setConfirmOpen(true)} className="self-start">
          Preview confirmation
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Unlink character"
          consequence="This removes Lo-Hauler and its ESI tokens from your account. Industry jobs tracked under this character stop syncing."
          busy={false}
          confirmLabel="Unlink"
          onConfirm={() => setConfirmOpen(false)}
          finalFocus={confirmTriggerRef}
          className="w-[min(440px,calc(100vw-2rem))]"
        />
      </DemoSection>
    </div>
  );
}
