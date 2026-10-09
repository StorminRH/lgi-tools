import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { DocTable } from '@/components/ui/static-table';
import type { CodexDataLayout } from '../nodes';
import { ClassIcon, DataIcon, SiteIcon, WormholeIcon } from './icons';

export type CodexSourceIcon = 'wormhole' | 'site' | 'class' | 'data';

export interface CodexSourceCatalogue {
  readonly sources: readonly {
    readonly id: string;
    readonly label: string;
    readonly provenance: string;
    readonly icon: CodexSourceIcon;
    readonly layouts: readonly CodexDataLayout[];
    readonly defaultFields: readonly string[];
    readonly fields: readonly { id: string; label: string }[];
  }[];
}

export interface CodexDataRow {
  readonly field: string;
  readonly label: string;
  readonly value: string;
}

export interface CodexDataBlockView {
  readonly source: string;
  readonly sourceLabel: string;
  readonly provenance: string;
  readonly icon: CodexSourceIcon;
  readonly title: string;
  readonly href: string | null;
  readonly rows: readonly CodexDataRow[];
}

export const CODEX_SOURCE_ICONS: Record<CodexSourceIcon, typeof DataIcon> = {
  wormhole: WormholeIcon,
  site: SiteIcon,
  class: ClassIcon,
  data: DataIcon,
};

function Title({ view }: { view: CodexDataBlockView }) {
  return view.href ? (
    <Link href={view.href} className="hover:text-isk">
      {view.title}
    </Link>
  ) : (
    view.title
  );
}

function Infobox({ view }: { view: CodexDataBlockView }) {
  const Icon = CODEX_SOURCE_ICONS[view.icon];
  return (
    <Card className="overflow-hidden" data-codex-block={view.source} data-codex-layout="infobox">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-isk/30 bg-isk/10 text-isk">
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <div className="font-display text-h3 font-bold uppercase leading-none tracking-optical text-name">
            <Title view={view} />
          </div>
          <div className="mt-1 font-ui text-label uppercase tracking-label text-muted">{view.sourceLabel}</div>
        </div>
      </div>
      <SectionHeader label="Properties" hint={view.provenance} />
      <dl className="divide-y divide-border-soft">
        {view.rows.map((row) => (
          <div key={row.field} className="flex items-baseline justify-between gap-4 px-4 py-2">
            <dt className="whitespace-nowrap font-ui text-ui text-muted">{row.label}</dt>
            <dd className="text-right font-data text-ui tabular-nums text-name">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Table({ view }: { view: CodexDataBlockView }) {
  return (
    <div data-codex-block={view.source} data-codex-layout="table">
      <div className="mb-2 flex items-baseline gap-2 font-ui">
        <span className="font-data text-ui text-name">
          <Title view={view} />
        </span>
        <span className="text-label uppercase tracking-label text-muted">{view.sourceLabel}</span>
      </div>
      <DocTable>
        <tr>
          {view.rows.map((row) => (
            <th key={row.field}>{row.label}</th>
          ))}
        </tr>
        <tr>
          {view.rows.map((row) => (
            <td key={row.field} className="font-data tabular-nums text-name">
              {row.value}
            </td>
          ))}
        </tr>
      </DocTable>
    </div>
  );
}

function Inline({ view }: { view: CodexDataBlockView }) {
  return (
    <span data-codex-block={view.source} data-codex-layout="inline">
      <span className="font-data text-name">
        <Title view={view} />
      </span>
      {view.rows.map((row, index) => (
        <span key={row.field}>
          {index > 0 ? ' · ' : ' — '}
          <span className="text-muted">{row.label.toLowerCase()}</span>{' '}
          <span className="font-data tabular-nums text-name">{row.value}</span>
        </span>
      ))}
    </span>
  );
}

const LAYOUTS = { infobox: Infobox, table: Table, inline: Inline };

export function CodexDataView({
  view,
  layout,
}: {
  view: CodexDataBlockView;
  layout: Exclude<CodexDataLayout, 'card'>;
}) {
  const Layout = LAYOUTS[layout];
  return <Layout view={view} />;
}
