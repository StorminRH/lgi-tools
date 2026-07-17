export interface EveType {
  id: number;
  groupId: number;
  name: string;
  description: string | null;
  mass: number | null;
  volume: number | null;
  capacity: number | null;
  portionSize: number | null;
  raceId: number | null;
  basePrice: number | null;
  published: boolean;
  marketGroupId: number | null;
  iconId: number | null;
  soundId: number | null;
  graphicId: number | null;
}

/**
 * Flat attrId → value map for one type. Hot-path shape consumed by the
 * npc-stats math layer; lives in eve-data because the data is from the SDE.
 */
export type AttrMap = Record<number, number>;
