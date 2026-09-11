import { isSecurityChip, systemClassificationReadout } from '@/data/eve-data/system-identity';
import {
  GLANCE_BUCKETS,
  identifiedGlanceBucket,
  type GlanceBucket,
  type SignatureWindowRow,
} from '../signatures/signature-model';

export type IntelLocationKind = 'wormhole' | 'k-space' | 'none';

export function intelLocationKind(
  facts: { readonly security: number | null; readonly whClassId: number | null },
): IntelLocationKind {
  if (isSecurityChip(facts)) return 'k-space';
  if (systemClassificationReadout(facts) !== null) return 'wormhole';
  return 'none';
}

export const INTEL_CATEGORY_LABEL: Record<GlanceBucket, string> = {
  harvestables: 'Harvestables',
  hacking: 'Hacking',
  combat: 'Combat',
};

export interface IntelCategoryBlock {
  readonly bucket: GlanceBucket;
  readonly label: string;
  readonly count: number;
  readonly names: readonly string[];
}

export function intelCategoryBlocks(
  rows: readonly SignatureWindowRow[],
  systemId: number,
): readonly IntelCategoryBlock[] {
  const namesByBucket = new Map<GlanceBucket, string[]>();
  const counts = new Map<GlanceBucket, number>();
  for (const row of rows) {
    if (row.systemId !== systemId) continue;
    const bucket = identifiedGlanceBucket(row.group);
    if (bucket === null) continue;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    if (row.name !== null) {
      const names = namesByBucket.get(bucket) ?? [];
      names.push(row.name);
      namesByBucket.set(bucket, names);
    }
  }
  return GLANCE_BUCKETS.flatMap((bucket) => {
    const count = counts.get(bucket) ?? 0;
    if (count === 0) return [];
    return [{
      bucket,
      label: INTEL_CATEGORY_LABEL[bucket],
      count,
      names: namesByBucket.get(bucket) ?? [],
    }];
  });
}

export function harvestableNamesForIntel(
  rows: readonly SignatureWindowRow[],
  systemId: number,
): readonly string[] {
  return intelCategoryBlocks(rows, systemId).find((block) => block.bucket === 'harvestables')
    ?.names ?? [];
}

export interface StaticSlot {
  readonly code: string;
  readonly className: string;
}

export function staticSlotsFromCodes(
  codes: readonly string[],
  classOf: (code: string) => string | null,
): readonly StaticSlot[] {
  const slots: StaticSlot[] = [];
  for (const code of codes) {
    const className = classOf(code);
    if (className === null) continue;
    slots.push({ code, className });
  }
  return slots;
}
