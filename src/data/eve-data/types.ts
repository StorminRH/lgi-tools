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

/**
 * One activity of CCP's stored blueprint `activities` document, in CCP's raw
 * shape (`typeID`). Each field is present only when the activity uses it.
 */
export type ActivityIO = {
  materials?: { typeID: number; quantity: number }[];
  products?: { typeID: number; quantity: number; probability?: number }[];
  skills?: { typeID: number; level: number }[];
  time?: number;
};

/** CCP's blueprint `activities` document as stored, keyed by activity name (`manufacturing`, `reaction`, …). */
export type BlueprintActivities = Record<string, ActivityIO | undefined>;

/** One input of a resolved build tree; `producedBy` is set when a blueprint makes it. */
export type TreeNode = {
  typeId: number;
  quantity: number;
  inputs: TreeNode[];
  producedBy?: { blueprintTypeId: number; quantityPerRun: number; runsNeeded: number };
};
