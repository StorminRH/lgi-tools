import { cacheLife } from 'next/cache';
import { Card } from '@/components/ui/card';
import { Dot } from '@/components/ui/dot';
import { SectionHeader } from '@/components/ui/section-header';
import { sumCodexBlobBytes } from '@/lib/codex-blob';
import { LEVEL_DOT_TONE, LEVEL_VALUE_CLASS } from '../status-tone';
import { blobUsageRow } from './health-view';

async function codexBlobBytes(): Promise<number | null> {
  'use cache: remote';
  cacheLife('days');
  return sumCodexBlobBytes();
}

async function readBytes(): Promise<number | null> {
  try {
    return await codexBlobBytes();
  } catch (error) {
    console.error('[admin/health] could not list Codex images', error);
    return null;
  }
}

export async function CodexBlobCard() {
  const row = blobUsageRow(await readBytes());
  return (
    <Card>
      <SectionHeader size="md" label="Codex images" />
      <div className="flex items-center gap-3 px-4 py-3 font-ui text-ui">
        <Dot tone={LEVEL_DOT_TONE[row.level]} size="lg" />
        <span className="min-w-0 flex-1 text-text">
          Blob storage
          <span className="block text-label text-muted">This environment&apos;s share of the {row.target}</span>
        </span>
        <span className={`shrink-0 whitespace-nowrap tabular-nums ${LEVEL_VALUE_CLASS[row.level]}`}>{row.value}</span>
      </div>
    </Card>
  );
}
