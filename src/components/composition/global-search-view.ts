import type { SearchResult, SearchSection } from '@/platform/search';
import { pillToneClasses, type PillTone } from '@/components/ui/pill';
import { itemImage, type EveImageDescriptor } from '@/data/eve-data/type-images';

export function searchRowImage(row: SearchResult): EveImageDescriptor | undefined {
  if (row.icon) return row.icon;
  return row.typeId !== undefined ? itemImage(row.typeId) : undefined;
}

export function splitMatchRuns(
  label: string,
  indices?: number[],
): { matched: boolean; text: string }[] {
  if (!indices || indices.length === 0) return [{ matched: false, text: label }];
  const hit = new Set(indices);
  const runs: { matched: boolean; text: string }[] = [];
  let i = 0;
  while (i < label.length) {
    const matched = hit.has(i);
    let j = i;
    while (j < label.length && hit.has(j) === matched) j++;
    runs.push({ matched, text: label.slice(i, j) });
    i = j;
  }
  return runs;
}

export function flattenSections(sections: SearchSection[]): SearchResult[] {
  return sections.flatMap((section) => section.results);
}

export function searchIconClass(iconTone?: string): string {
  const tone: PillTone =
    iconTone && Object.hasOwn(pillToneClasses, iconTone) ? (iconTone as PillTone) : 'neutral';
  return pillToneClasses[tone];
}
