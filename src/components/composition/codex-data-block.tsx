import { Suspense, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatDataBlock,
  loadCodexEntity,
  resolveDataBlock,
  type CodexDataBlockAttrs,
  type CodexSourceId,
} from '@/composition/codex-sources';
import { CodexDataView } from '@/features/codex/components/CodexDataView';
import type { CodexInjectedComponents } from '@/features/codex/render';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import type { SiteDetail } from '@/features/wormhole-sites/types';

export const CARD_VIEWS: Partial<Record<CodexSourceId, (row: unknown) => ReactNode>> = {
  site: (row) => <SiteCard site={row as SiteDetail} presentation="standalone" />,
};

const warned = new Set<string>();

function warnOnce(key: string, ...message: string[]) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(...message);
}

export async function CodexDataBlock({ attrs }: { attrs: CodexDataBlockAttrs }) {
  const resolution = resolveDataBlock(attrs);
  if (!resolution.ok) {
    warnOnce(
      `${attrs.source}:${attrs.key}:${resolution.reason}`,
      `[codex] data block skipped: ${resolution.reason}`,
      `${attrs.source}:${attrs.key}`,
    );
    return null;
  }
  const { source, key } = resolution;
  for (const field of resolution.dropped) {
    warnOnce(`${source}:${key}:${field}`, `[codex] data block ${source}:${key} drops unknown field "${field}"`);
  }
  const row = await loadCodexEntity(source, key);
  if (row === null) {
    const Missing = resolution.layout === 'inline' ? 'span' : 'p';
    return (
      <Missing data-codex-block={source} data-codex-missing="">
        {`No data for ${key}.`}
      </Missing>
    );
  }
  if (resolution.layout === 'card') return CARD_VIEWS[source]?.(row) ?? null;
  return <CodexDataView view={formatDataBlock(resolution, row)} layout={resolution.layout} />;
}

export const codexComponents: CodexInjectedComponents = {
  dataBlock: ({ attrs }) => (
    <Suspense fallback={<Skeleton label="Loading data" className="h-32 w-full rounded-card" />}>
      <CodexDataBlock attrs={attrs} />
    </Suspense>
  ),
  dataInline: ({ attrs }) => (
    <Suspense fallback={<Skeleton label="Loading data" className="inline-block h-[1em] w-24 align-middle" />}>
      <CodexDataBlock attrs={{ ...attrs, layout: 'inline' }} />
    </Suspense>
  ),
};
