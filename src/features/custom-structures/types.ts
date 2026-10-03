import type { EnteredBonuses } from '@/data/industry-math/entered-bonuses';

export interface CustomStructureRow {
  id: string;
  name: string;
  structureTypeId: number;
  rigTypeIds: number[];
  systemId: number | null;
  taxPct: number | null;
  bonuses: EnteredBonuses | null;
}
