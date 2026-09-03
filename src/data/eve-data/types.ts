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

export type AttrMap = Record<number, number>;
