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

/** A row's list value. A recent can repeat a row another section shows, so the section name qualifies its id. */
export function searchRowKey(section: SearchSection, row: SearchResult): string {
  return `${section.name}/${row.id}`;
}

/** Every row in display order, by its list value. */
export function searchRowsByKey(sections: SearchSection[]): Map<string, SearchResult> {
  return new Map(
    sections.flatMap((section) => section.results.map((row) => [searchRowKey(section, row), row] as const)),
  );
}

export function searchIconClass(iconTone?: string): string {
  const tone: PillTone =
    iconTone && Object.hasOwn(pillToneClasses, iconTone) ? (iconTone as PillTone) : 'neutral';
  return pillToneClasses[tone];
}
