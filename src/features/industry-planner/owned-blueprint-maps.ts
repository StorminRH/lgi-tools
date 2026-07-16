import type { OwnedBlueprintMeEntry, OwnedComponentDetail } from './types';

export interface OwnedBlueprintMaps {
  ownedMe: Map<number, number>;
  ownedDetail: Map<number, OwnedComponentDetail>;
}

// One owned-blueprint response feeds two deliberately separate channels: ME for
// cost computation, and TE/ownership/location detail for readout presentation.
export function mapOwnedBlueprints(blueprints: OwnedBlueprintMeEntry[]): OwnedBlueprintMaps {
  const ownedMe = new Map<number, number>();
  const ownedDetail = new Map<number, OwnedComponentDetail>();
  for (const blueprint of blueprints) {
    ownedMe.set(blueprint.blueprintTypeId, blueprint.me);
    ownedDetail.set(blueprint.blueprintTypeId, {
      te: blueprint.te,
      ownerType: blueprint.ownerType,
      ownerName: blueprint.ownerName,
      locationName: blueprint.locationName,
      locationFlag: blueprint.locationFlag,
    });
  }
  return { ownedMe, ownedDetail };
}
