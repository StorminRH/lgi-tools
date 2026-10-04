'use client';

import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { AnnotatedDailyChart } from '@/components/ui/annotated-daily-chart';
import { BarChart } from '@/components/ui/bar-chart';
import { Card } from '@/components/ui/card';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { Measured } from '@/components/ui/measured';
import { SortableTable, type SortableColumn } from '@/components/ui/sortable-table';
import { SplitAxisChart } from '@/components/ui/split-axis-chart';
import { StackedAreaChart } from '@/components/ui/stacked-area-chart';
import { SlimShareBar, StackedShareBar } from '@/components/ui/stacked-share-bar';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { TrendChart } from '@/components/ui/trend-chart';
import {
  sampleAverage,
  sampleBars,
  sampleDaily,
  sampleLabels,
  sampleSplit,
  sampleStacked,
  sampleTrend,
  sampleWeekend,
} from './sample-series';
import { ReferenceGroup, Specimen } from './specimen';

type Material = { material: string; quantity: number };

const MATERIAL_COLUMNS = [
  { key: 'material', label: 'Material', rowHeader: true, render: (row) => row.material },
  { key: 'quantity', label: 'Quantity', align: 'right', render: (row) => row.quantity.toLocaleString('en-US') },
] satisfies readonly StaticTableColumn<Material>[];

type Plan = { id: string; name: string; runs: number; margin: number };

const PLANS: Plan[] = [
  { id: 'praxis', name: 'Praxis', runs: 3, margin: 41.2 },
  { id: 'gila', name: 'Gila', runs: 1, margin: 18.6 },
  { id: 'ishtar', name: 'Ishtar', runs: 2, margin: 27.9 },
];

const PLAN_COLUMNS: SortableColumn<Plan>[] = [
  { key: 'name', label: 'Hull', render: (row) => row.name },
  { key: 'runs', label: 'Runs', align: 'right', render: (row) => row.runs },
  { key: 'margin', label: 'Margin', align: 'right', render: (row) => `+${row.margin}M` },
  { key: 'note', label: 'Note', sortable: false, render: () => '—' },
];

const PLAN_SORT_KEYS = ['name', 'runs', 'margin'] as const;
type PlanSortKey = (typeof PLAN_SORT_KEYS)[number];

function planSortKey(value: string | null): PlanSortKey {
  return PLAN_SORT_KEYS.find((key) => key === value) ?? 'margin';
}

function sortPlans(key: PlanSortKey, dir: 'asc' | 'desc'): Plan[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...PLANS].sort((a, b) => (a[key] > b[key] ? sign : -sign));
}

function SortablePlans() {
  const params = useSearchParams();
  const sortKey = planSortKey(params.get('sort'));
  const sortDir = params.get('dir') === 'asc' ? 'asc' : 'desc';
  return (
    <SortableTable<Plan>
      columns={PLAN_COLUMNS}
      rows={sortPlans(sortKey, sortDir)}
      gridColsClass="grid-cols-[1.4fr_0.6fr_0.8fr_0.6fr]"
      sortKey={sortKey}
      sortDir={sortDir}
      basePath="/preview/primitives"
      currentParams={{}}
      getRowKey={(row) => row.id}
    />
  );
}

function ChartSlot({ children }: { children: (width: number) => ReactNode }) {
  return (
    <Card className="p-3">
      <Measured>{children}</Measured>
    </Card>
  );
}

const formatIsk = (value: number) => `${value.toLocaleString('en-US')}M`;
const shortDay = (label: string) => label.slice(5);

export function DataGroup() {
  return (
    <ReferenceGroup
      id="data"
      title="Data"
      intro="Tables, distributions, and the visx chart family. Charts read their width from Measured."
    >
      <Specimen
        name="SortableTable"
        source="sortable-table"
        note="A URL-driven sortable grid. Header links rewrite the sort query; this sample reads it back."
        wide
      >
        <SortablePlans />
      </Specimen>

      <Specimen
        name="StaticTable"
        source="static-table"
        note="A semantic read-only table with typed columns and optional row headers."
      >
        <Card className="overflow-hidden">
          <StaticTable
            ariaLabel="Example material requirements"
            columns={MATERIAL_COLUMNS}
            rows={[
              { material: 'Tritanium', quantity: 124000 },
              { material: 'Mexallon', quantity: 8400 },
              { material: 'Isogen', quantity: 2100 },
            ]}
            getRowKey={(row) => row.material}
          />
        </Card>
      </Specimen>

      <Specimen
        name="DistributionBars"
        source="distribution-bars"
        note="Ranked counts with share percentages over thin progress tracks."
      >
        <Card className="overflow-hidden">
          <DistributionBars
            ariaLabel="Sites by type"
            rows={sampleBars.map((bar) => ({ key: bar.label, label: bar.label, count: bar.value }))}
          />
        </Card>
      </Specimen>

      <Specimen
        name="StackedShareBar"
        source="stacked-share-bar"
        note="One bar split into labelled shares."
        wide
      >
        <Measured>
          {(width) => (
            <StackedShareBar
              ariaLabel="Wallet split"
              width={width}
              segments={[
                { label: 'Liquid', value: 62, tone: 'green' },
                { label: 'Escrow', value: 23, tone: 'blue' },
                { label: 'Assets', value: 15, tone: 'purple' },
              ]}
            />
          )}
        </Measured>
      </Specimen>

      <Specimen
        name="SlimShareBar"
        source="stacked-share-bar"
        note="A label-free share split on the thin progress track."
        wide
      >
        <SlimShareBar
          ariaLabel="Sync runs: 23 synced, 6 partial"
          segments={[
            { label: 'synced', value: 23, tone: 'green' },
            { label: 'partial', value: 6, tone: 'orange' },
          ]}
        />
      </Specimen>

      <Specimen name="BarChart" source="bar-chart" note="Categorical bars with a value axis and hover tooltip.">
        <ChartSlot>
          {(width) => <BarChart data={sampleBars} width={width} tone="teal" ariaLabel="Sites by type" />}
        </ChartSlot>
      </Specimen>

      <Specimen name="TrendChart" source="trend-chart" note="A filled line over time with a zero-based axis.">
        <ChartSlot>
          {(width) => (
            <TrendChart data={sampleTrend} labels={sampleLabels} width={width} formatTick={shortDay} ariaLabel="Trend sample" />
          )}
        </ChartSlot>
      </Specimen>

      <Specimen
        name="AnnotatedDailyChart"
        source="annotated-daily-chart"
        note="Daily bars with a rolling average, weekend shading, a reference line, event markers, and an end label."
        wide
      >
        <ChartSlot>
          {(width) => (
            <AnnotatedDailyChart
              points={sampleDaily}
              average={sampleAverage}
              labels={sampleLabels}
              weekend={sampleWeekend}
              referenceLine={{ value: 140, label: 'target' }}
              eventMarkers={[{ x: 9, label: 'v4.1' }]}
              endLabel={{ valueText: '128', deltaText: '+6%', deltaHex: null }}
              tone="green"
              width={width}
              height={200}
              formatTick={shortDay}
              ariaLabel="Daily sample"
            />
          )}
        </ChartSlot>
      </Specimen>

      <Specimen name="StackedAreaChart" source="stacked-area-chart" note="Bands stacked from zero; a band can begin partway along.">
        <ChartSlot>
          {(width) => (
            <StackedAreaChart
              data={sampleStacked}
              bands={[{ key: 'industry', tone: 'blue' }, { key: 'trade', tone: 'purple' }]}
              width={width}
              formatY={formatIsk}
              formatTick={shortDay}
              ariaLabel="Stacked sample"
              renderTooltip={(datum) => <span>{datum.label}</span>}
            />
          )}
        </ChartSlot>
      </Specimen>

      <Specimen name="SplitAxisChart" source="split-axis-chart" note="Two series far apart in range, each on its own fitted segment.">
        <ChartSlot>
          {(width) => (
            <SplitAxisChart
              data={sampleSplit}
              upperTone="green"
              lowerTone="orange"
              upperDomain={[8_800, 10_000]}
              lowerDomain={[60, 180]}
              width={width}
              formatY={formatIsk}
              formatTick={shortDay}
              ariaLabel="Split axis sample"
              renderTooltip={(datum) => <span>{datum.label}</span>}
            />
          )}
        </ChartSlot>
      </Specimen>
    </ReferenceGroup>
  );
}
