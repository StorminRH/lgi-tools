export interface CustomStructureRow {
  id: string;
  name: string;
  structureTypeId: number;
  rigTypeIds: number[];
  systemId: number | null;
  taxPct: number | null;
}
