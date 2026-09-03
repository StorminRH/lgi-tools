export type FacilitySelection =
  | { kind: 'add-custom' }
  | { kind: 'structure'; id: string }
  | { kind: 'station'; id: number }
  | { kind: 'clear' };

export function parseFacilityValue(value: string): FacilitySelection {
  if (value === 'add-custom') return { kind: 'add-custom' };
  if (value.startsWith('structure:')) return { kind: 'structure', id: value.slice('structure:'.length) };
  if (value.startsWith('station:')) return { kind: 'station', id: Number(value.slice('station:'.length)) };
  return { kind: 'clear' };
}

export function facilityValueFor(
  selectedStructure: { id: string } | null,
  station: { id: number } | null,
): string {
  if (selectedStructure) return `structure:${selectedStructure.id}`;
  if (station) return `station:${station.id}`;
  return '';
}

export function structureById<T extends { id: string }>(structures: T[], id: string): T | null {
  return structures.find((s) => s.id === id) ?? null;
}
