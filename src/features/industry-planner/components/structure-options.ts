import type { SelectOptionGroup } from '@/components/ui/select';
import type { AvailableStructure } from '../types';

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
