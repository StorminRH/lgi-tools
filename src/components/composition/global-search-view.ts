import type { SearchResult, SearchSection } from '@/platform/search';
import { pillToneClasses, type PillTone } from '@/components/ui/pill';
import { itemImage, type EveImageDescriptor } from '@/data/eve-data/type-images';

/**
 * Resolves a search row's image with source-owned descriptors taking precedence over the generic
 * item image derived from typeId; rows with neither identity keep their glyph badge.
 */
export function searchRowImage(row: SearchResult): EveImageDescriptor | undefined {
  if (row.icon) return row.icon;
  return row.typeId !== undefined ? itemImage(row.typeId) : undefined;
}

/**
 * Splits a label into matched / unmatched runs for highlight rendering. Adjacent
 * matched chars collapse into one run so a substring match renders as a single
 * highlighted span, not N nested ones. With no indices the whole label is one
 * unmatched run.
 */
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

/**
 * The engine's sections flattened to one list, fed to the combobox as its item
 * model so keyboard navigation runs continuously across the whole result set
 * (the rows are still rendered grouped below it — the flat list matches the old
 * cross-group flat-index navigation).
 */
export function flattenSections(sections: SearchSection[]): SearchResult[] {
  return sections.flatMap((section) => section.results);
}

/**
 * A result icon badge's colour classes, resolved from the (abstract) iconTone the
 * source emitted. Unknown / legacy tones (e.g. an old localStorage recent stored
 * under the retired `cls-*` scheme) fall back to neutral.
 */
export function searchIconClass(iconTone?: string): string {
  const tone: PillTone =
    iconTone && Object.hasOwn(pillToneClasses, iconTone) ? (iconTone as PillTone) : 'neutral';
  return pillToneClasses[tone];
}
