import { systemSecurityClass } from '@/data/eve-data/security';
import { systemClassificationReadout } from '@/data/eve-data/system-identity';
import { GLANCE_BUCKETS, identifiedGlanceBucket, type GlanceBucket, type SignatureWindowRow } from '../signatures/signature-model';

export const INTEL_CATEGORY_LABEL: Record<GlanceBucket, string> = {
  harvestables: 'Harvestables', hacking: 'Hacking', combat: 'Combat',
};

export interface IntelCategoryBlock {
  readonly bucket: GlanceBucket;
  readonly rows: readonly SignatureWindowRow[];
}

export function intelCategoryBlocks(rows: readonly SignatureWindowRow[], systemId: number): readonly IntelCategoryBlock[] {
  const buckets = new Map<GlanceBucket, SignatureWindowRow[]>();
  for (const row of rows) {
    if (row.systemId !== systemId) continue;
    const bucket = identifiedGlanceBucket(row.group);
    if (bucket === null) continue;
    const entries = buckets.get(bucket) ?? [];
    entries.push(row);
    buckets.set(bucket, entries);
  }
  return GLANCE_BUCKETS.flatMap((bucket) => {
    const entries = buckets.get(bucket);
    return entries === undefined ? [] : [{ bucket, rows: entries }];
  });
}

export function intelLocationKind(facts: { readonly security: number | null; readonly whClassId: number | null }) {
  if (systemClassificationReadout(facts) === null) return 'none';
  return systemSecurityClass(facts.security, facts.whClassId) === 'wormhole' ? 'wormhole' : 'k-space';
}
