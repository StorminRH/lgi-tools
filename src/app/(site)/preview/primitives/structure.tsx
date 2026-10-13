'use client';

import { Button } from '@/components/ui/button';
import { Card, cardSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Collapsible, CollapsibleChevron } from '@/components/ui/collapsible';
import { Measured } from '@/components/ui/measured';
import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { PageFooter } from '@/components/ui/page-footer';
import { Pill } from '@/components/ui/pill';
import { ReadoutLine, ReadoutList, ReadoutRow, type ReadoutLineProps } from '@/components/ui/readout';
import { EntityRow, LabeledChipRow, ResourceRow, Stat } from '@/components/ui/row';
import { SectionFooter } from '@/components/ui/section-footer';
import { QuietSectionHead, SectionHead } from '@/components/ui/section-head';
import { SectionHeader } from '@/components/ui/section-header';
import { SectionLabel } from '@/components/ui/section-label';
import { SectionPanel } from '@/components/ui/section-panel';
import { StatFigure } from '@/components/ui/stat-figure';
import { UrlSync } from '@/components/ui/url-sync';
import { ReferenceGroup, Specimen, Variant } from './specimen';

const RESOURCE_COLS = 'grid-cols-[minmax(0,1fr)_auto_auto]';

const STAT_TILE = cn(cardSurface, 'gap-1 px-3 py-2.5');

const MULTIPLES = [
  { title: 'Jobs running', value: '14', note: 'of 20 slots' },
  { title: 'Margin today', value: '+41.2M', note: 'ISK across 3 plans' },
  { title: 'Sites cleared', value: '7', note: 'this week' },
] as const;

type SampleReadout = ReadoutLineProps & { id: string };

const READOUTS: SampleReadout[] = [
  { id: 'budget', tone: 'green', status: 'Healthy', label: 'Error budget', note: 'floor 20 · live', value: '100 left' },
  { id: 'source', tone: 'orange', status: 'Warning', label: 'Price source', note: 'no price refreshes this period', value: 'idle', valueTone: 'orange' },
  { id: 'cron', tone: 'red', status: 'Failing', label: 'Price cron', value: 'never ran', valueTone: 'red' },
  { id: 'esi', tone: 'neutral', status: 'No data', label: 'ESI availability', note: 'target ≥ 95%', value: 'no data', valueTone: 'muted' },
  { id: 'scoreboard', label: 'Scoreboard source', note: 'development fallback', value: 'process-local' },
];

const OVERFLOW_READOUTS: SampleReadout[] = [
  {
    id: 'long-value',
    tone: 'red',
    status: 'Failing',
    label: 'GSC sync',
    note: 'last success 2026-09-30 04:12 UTC',
    value: 'last attempt failed: upstream returned 503 Service Unavailable',
    valueTone: 'red',
  },
  {
    id: 'long-label',
    tone: 'orange',
    status: 'Warning',
    label: 'Dead-lettered owned-data refreshes for characters without a valid token',
    note: 'retry_exhausted · esi_5xx · token_revoked · scope_missing · rate_limited',
    value: '3 dead · 12 queued',
    valueTone: 'orange',
    trailing: <Button variant="secondary" size="sm">Open</Button>,
  },
];

function SampleReadouts({ rows }: { rows: SampleReadout[] }) {
  return (
    <Card className="overflow-hidden">
      <ReadoutList>
        {rows.map(({ id, ...line }) => (
          <ReadoutRow key={id} {...line} />
        ))}
      </ReadoutList>
    </Card>
  );
}

export function StructureGroup() {
  return (
    <ReferenceGroup
      id="structure"
      title="Structure"
      intro="The scaffolding inside cards: section heads and labels, rows, disclosure, and grids."
    >
      <Specimen
        name="SectionHead"
        source="section-head"
        note="A display heading with optional leading glyph, chips, description, and right-aligned meta. Each group on this page uses one."
        wide
      >
        <SectionHead
          title="Build queue"
          chips={<><Pill tone="green">3 plans</Pill><Pill tone="blue">Manufacturing</Pill></>}
          description="Jobs installed from saved plans across your characters."
          meta={<Stat>Updated 2 min ago</Stat>}
        />
      </Specimen>

      <Specimen
        name="QuietSectionHead"
        source="section-head"
        note="For pages whose rail already names the section: the title is for screen readers only and any tools sit in a right-aligned row. onTitleLine lifts that row onto the page title's line from lg up."
      >
        <QuietSectionHead title="Health" meta={<Pill tone="neutral">7d · 30d · 90d</Pill>} />
      </Specimen>

      <Specimen
        name="SectionPanel + SectionHeader + SectionLabel + SectionFooter"
        source="section-panel · section-header · section-label · section-footer"
        note="Card chrome. SectionPanel is the titled card: the card glass under a medium header bar, with meta at the right of the bar. Inside it, a small header bar or a sentence-case sub-heading titles a block, and a footer carries totals; the // section label titles a group. titleAs on SectionPanel, and as on SectionHeader, render the title as an h2 or h3 so cards join the page outline."
      >
        <div className="flex flex-col gap-4">
          <SectionPanel title="Materials" meta="12 items">
            <SectionHeader label="Small bar" hint="size=sm" />
            <div className="px-3.5 py-3">
              <SectionHeader label="Sub variant · as h3" variant="sub" as="h3" className="mb-2" />
              <p className="font-ui text-ui text-muted">The block this sub-heading titles.</p>
            </div>
            <SectionFooter label="Total" value="128.4M ISK" />
          </SectionPanel>
          <div className="flex flex-col gap-2">
            <SectionLabel meta={<Stat>3 items</Stat>}>Section label</SectionLabel>
            <SectionLabel prefix={false}>Without prefix</SectionLabel>
          </div>
        </div>
      </Specimen>

      <Specimen
        name="ReadoutList + ReadoutRow"
        source="readout"
        note="The key/value status row: an optional dot with a screen-reader verdict, a label with a note beneath, a right-aligned value, and a trailing slot. The dot centres on the label's first line. The value is capped at half the row and wraps, so a long value never overprints its label."
        wide
      >
        <div className="flex flex-col gap-4">
          <SampleReadouts rows={READOUTS} />
          <Variant label="overflow · 60-character value, long label, trailing button">
            <SampleReadouts rows={OVERFLOW_READOUTS} />
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="Rows"
        source="row"
        note="EntityRow, ResourceRow, Stat, and LabeledChipRow: the dense list rows inside cards."
      >
        <Card className="overflow-hidden">
          <LabeledChipRow label="Filters">
            <Pill tone="orange">Gas</Pill>
            <Pill tone="blue">Ore</Pill>
          </LabeledChipRow>
          <EntityRow leading="01" name="Praxis" chips={<Pill tone="green">+12%</Pill>} trailing={<Stat>3 runs</Stat>} />
          <EntityRow leading="02" name="Gila" chips={<Pill tone="orange">+3%</Pill>} inlineChips trailing={<Stat>1 run</Stat>} />
          <ResourceRow name="Tritanium" meta="124,000 units" value="0.9M" colsClass={RESOURCE_COLS} />
          <ResourceRow name="Mexallon" meta="8,400 units" value="0.6M" colsClass={RESOURCE_COLS} />
        </Card>
      </Specimen>

      <Specimen
        name="Collapsible + UrlSync"
        source="collapsible · url-sync · readout"
        note="Native disclosure rows. chevron adds the turning ▾, hidden from screen readers; CollapsibleChevron places one inside a custom header. A ReadoutLine makes a status row the summary. UrlSync mirrors the open state into the address bar, here as a #fragment so a reload stays on this page."
      >
        <Card className="overflow-hidden">
          <Collapsible
            chevron
            headerClassName="py-2.5"
            header={
              <ReadoutLine
                tone="orange"
                status="Warning"
                label="Tracked operation p95"
                note="target ≤ 1,500 ms"
                value="1,840 ms"
                valueTone="orange"
              />
            }
          >
            <p className="px-3.5 pb-3 font-ui text-ui text-muted">The detail behind the status line.</p>
          </Collapsible>
          <Collapsible
            defaultOpen
            header={
              <span className="flex min-w-0 items-center gap-2">
                <CollapsibleChevron />
                <span className="text-name">Material breakdown</span>
              </span>
            }
          >
            <p className="px-3.5 pb-3 font-ui text-ui text-muted">Opens by default; CollapsibleChevron leads this custom header.</p>
          </Collapsible>
          <UrlSync basePath="/preview/primitives#" entityId="collapsible-sample">
            <Collapsible header={<span className="text-name">Synced to the URL</span>}>
              <p className="px-3.5 pb-3 font-ui text-ui text-muted">Watch the address bar while toggling.</p>
            </Collapsible>
          </UrlSync>
        </Card>
      </Specimen>

      <Specimen
        name="MultiplesGrid + Measured"
        source="multiples-grid · measured"
        note="Small-multiple stat tiles on a hairline grid, marked up as a description list. The chart slot is optional. Measured hands its width to children such as charts."
      >
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden">
            <MultiplesGrid columns={3}>
              {MULTIPLES.map((cell) => (
                <MultiplesCell key={cell.title} title={cell.title} value={cell.value} note={cell.note}>
                  <span className="font-ui text-micro text-faint">sparkline slot</span>
                </MultiplesCell>
              ))}
            </MultiplesGrid>
          </Card>
          <Variant label="figures only · composed value with a delta">
            <Card className="overflow-hidden">
              <MultiplesGrid columns={2}>
                <MultiplesCell title="User accounts" value="1,204" />
                <MultiplesCell
                  title="Page views"
                  value={<>12.4<span className="text-muted">k</span></>}
                  delta={<Pill tone="green">+6%</Pill>}
                  note="412 / day"
                />
              </MultiplesGrid>
            </Card>
          </Variant>
          <Variant label="measured">
            <Measured>
              {(width) => <span className="font-data text-ui text-isk">This slot is {width}px wide</span>}
            </Measured>
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="StatFigure"
        source="stat-figure"
        note="A small labelled figure: an eyebrow term over a tabular value, rendered as a term and description inside a dl. The value takes a tone; the lg size and a note line suit a figure that stands as its own tile."
      >
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-3 gap-3">
            <StatFigure label="Active">14</StatFigure>
            <StatFigure label="Ready" tone="text-isk">3</StatFigure>
            <StatFigure label="Slots">17/20</StatFigure>
          </dl>
          <Variant label="tile · lg with a note">
            <dl className="grid grid-cols-2 gap-2">
              <StatFigure
                label="Skill points"
                size="lg"
                note="+1.2M free"
                noteTone="text-isk"
                className={STAT_TILE}
              >
                48.6M
              </StatFigure>
              <StatFigure label="Skills" size="lg" note="212 at V" className={STAT_TILE}>
                431
              </StatFigure>
            </dl>
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="PageFooter"
        source="page-footer"
        note="The site footer bar with left, centre, and right slots."
        wide
      >
        <PageFooter
          className="m-0"
          left={<span className="text-muted">LGI.tools · Lo-Gang Industries</span>}
          center={<span className="text-faint">v4.1</span>}
          right={<span className="text-muted">EVE Online © CCP</span>}
        />
      </Specimen>
    </ReferenceGroup>
  );
}
