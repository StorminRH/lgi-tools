import type { SelectOptionGroup } from '@/components/ui/select';
import type { AvailableStructure } from '../types';

// The per-source structure segments of a facility select (3.7.13.2) — shared by
// the build-location and refinery selects so the two segmented lists can't drift.
// Returns the corp/custom groups as dropdown-select data (an empty segment is
// omitted); the caller assembles them into its own `items` list around its default
// option and any trailing entries.
export function structureOptionGroups(structures: AvailableStructure[]): SelectOptionGroup[] {
  const groups: SelectOptionGroup[] = [];
  const corp = structures.filter((s) => s.source === 'corp');
  const custom = structures.filter((s) => s.source === 'custom');
  if (corp.length > 0) {
    groups.push({
      group: 'Corp structures',
      options: corp.map((s) => ({ value: `structure:${s.id}`, label: s.name })),
    });
  }
  if (custom.length > 0) {
    groups.push({
      group: 'Custom structures',
      options: custom.map((s) => ({ value: `structure:${s.id}`, label: s.name })),
    });
  }
  return groups;
}
