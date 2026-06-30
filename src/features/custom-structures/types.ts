// The read/display shape of one saved custom structure — what the management list
// renders and what the create/delete endpoints echo back. No security or resolved
// dogma here: the planner's available-structures read joins the SDE dogma onto
// these rows; this is just the durable definition the user authored.
export interface CustomStructureRow {
  id: string;
  name: string;
  structureTypeId: number;
  rigTypeIds: number[];
}
