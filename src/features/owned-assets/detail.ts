// The owned-asset READOUT detail (3.7.7.2). Turns the per-type summary's raw owner
// + location ids into the labelled "held by" rows the planner's asset ledger
// popover shows (owner · location · flag · quantity), alongside the owned quantity
// the QTY ring + ledger consume.
//
// PURE (no I/O): name resolution is injected as a plain `names` record + a station
// formatter, so this reduce is unit-tested directly and the real ESI resolver is
// wired above it (src/db/owned-assets-sync.ts) — the refresh.ts DI pattern. A
// mirror of the owned-blueprints detail.ts, with one divergence: an asset holding
// carries `location_type`, so the location-name resolution BRANCHES on it (a
// blueprint is always at a station/structure; an asset can be in a station, a
// solar system, or a container).
import type { AssetHolding, OwnedAssetMap } from './asset-map';
import type { OwnedAssetOwnerType } from './schema';

// EVE player (Upwell) structure ids start at 1e12; NPC station ids sit far below
// (~60–64M). A structure's name needs the read_structures scope + docking access
// we deliberately don't hold, so structures degrade to a generic label. Re-declared
// locally rather than imported from owned-blueprints/detail.ts — a feature → feature
// import is boundary-banned; this is the sanctioned template clone.
const STRUCTURE_ID_FLOOR = 1_000_000_000_000;

function isPlayerStructure(locationId: number): boolean {
  return locationId >= STRUCTURE_ID_FLOOR;
}

const STRUCTURE_LABEL = 'Upwell structure';
const SHIP_LABEL = 'In a ship';
const CONTAINER_LABEL = 'In a container';
const UNKNOWN_LOCATION_LABEL = 'Unknown location';

// EVE nests assets like dolls: an 'item'-type location_id is the PARENT (a structure,
// a ship, or a container) and location_flag names the sub-slot. The flag alone tells us
// the KIND of place — a corp hangar division or a personal hangar means a player
// structure; a ship slot/hold/bay means a ship; a (un)locked flag a container. The
// parent's actual NAME (the structure's name, the custom division name) needs the asset
// tree + the read_structures / read_divisions scopes we don't hold — see the held-by
// real-names follow-up in the scratchpad. Until then we name the kind, honestly generic.
function isStructureFlag(flag: string): boolean {
  return flag === 'Hangar' || flag === 'Deliveries' || flag.startsWith('Corp');
}
function isShipFlag(flag: string): boolean {
  // Fitting slots end in an index; named holds/bays end in Hold/Bay; ship/fleet hangars
  // end in Hangar (the bare 'Hangar' personal-hangar flag is a structure, matched above).
  return /Slot\d+$/.test(flag) || /(?:Hold|Bay)$/.test(flag) || /.Hangar$/.test(flag) || flag === 'Cargo';
}

// The friendly secondary label shown after the location (in-game's hangar-division line).
// Only a corp hangar division carries a meaningful "which one" worth showing; everything
// else is covered by the location label, so it suppresses to empty.
function friendlyFlag(flag: string): string {
  const corpHangar = /^CorpSAG([1-7])$/.exec(flag);
  return corpHangar ? `Corp Hangar ${corpHangar[1]}` : '';
}

/** One resolved holding for the popover: who holds it, where, and how much. */
export interface ResolvedHolding {
  ownerType: OwnedAssetOwnerType;
  ownerName: string;
  locationName: string;
  locationFlag: string;
  quantity: number;
}

/** One owned type's ledger detail: total owned + the resolved held-by list. */
export interface OwnedAssetDetailEntry {
  typeId: number;
  ownedQty: number;
  heldBy: ResolvedHolding[];
}

// A station id is resolvable through /universe/names ONLY when it is an NPC station
// (below the structure floor); a solar_system id always resolves; player structures,
// container item ids ('item'), and 'other' never resolve, so they are excluded from
// the bounded name pass (no point spending the shared budget on a guaranteed miss).
function isResolvableLocation(holding: AssetHolding): boolean {
  if (holding.locationType === 'solar_system') return true;
  if (holding.locationType === 'station') return !isPlayerStructure(holding.locationId);
  return false;
}

/**
 * The distinct ids worth a name lookup: every holding's owner, plus its location
 * when that location is resolvable. Deduped; only types the map holds contribute
 * (the map is already scoped to the requested types by the reduce).
 */
export function collectAssetNameIds(map: OwnedAssetMap): number[] {
  const ids = new Set<number>();
  for (const summary of map.values()) {
    for (const holding of summary.heldBy) {
      ids.add(holding.ownerId);
      if (isResolvableLocation(holding)) ids.add(holding.locationId);
    }
  }
  return [...ids];
}

// A human label for an owner that didn't resolve (ESI miss / flaky lookup).
function ownerFallback(ownerType: OwnedAssetOwnerType, ownerId: number): string {
  return ownerType === 'corporation' ? `Corporation ${ownerId}` : `Character ${ownerId}`;
}

// Resolve a holding's location to a label, branching on location_type. A station is an
// NPC station (name-formatted) or a player structure (generic label); a solar system
// shows its system name verbatim (NOT station-formatted, which would mangle a system
// name); a nested 'item' location names the KIND of parent the flag identifies (a
// structure, a ship, or a container); 'other' degrades to a generic label.
function resolveLocationName(
  locationId: number,
  locationType: string,
  locationFlag: string,
  names: Record<string, string>,
  formatStation: (name: string) => string,
): string {
  if (locationType === 'station') {
    if (isPlayerStructure(locationId)) return STRUCTURE_LABEL;
    const resolved = names[String(locationId)];
    return resolved ? formatStation(resolved) : UNKNOWN_LOCATION_LABEL;
  }
  if (locationType === 'solar_system') {
    return names[String(locationId)] ?? UNKNOWN_LOCATION_LABEL;
  }
  if (locationType === 'item') {
    if (isStructureFlag(locationFlag)) return STRUCTURE_LABEL;
    if (isShipFlag(locationFlag)) return SHIP_LABEL;
    return CONTAINER_LABEL; // (un)locked flags + any other nested item → a container
  }
  return UNKNOWN_LOCATION_LABEL;
}

/**
 * Assemble the ledger detail for every type the map holds. Owner/location names
 * come from the injected `names` record (stringified-id keys, matching the
 * resolver's wire shape); unresolved owners/locations degrade to a generic label.
 */
export function buildOwnedAssetDetail(
  map: OwnedAssetMap,
  names: Record<string, string>,
  formatStation: (name: string) => string,
): OwnedAssetDetailEntry[] {
  const entries: OwnedAssetDetailEntry[] = [];
  for (const [typeId, summary] of map) {
    entries.push({
      typeId,
      ownedQty: summary.ownedQty,
      heldBy: summary.heldBy.map((holding) => ({
        ownerType: holding.ownerType,
        ownerName: names[String(holding.ownerId)] ?? ownerFallback(holding.ownerType, holding.ownerId),
        locationName: resolveLocationName(
          holding.locationId,
          holding.locationType,
          holding.locationFlag,
          names,
          formatStation,
        ),
        locationFlag: friendlyFlag(holding.locationFlag),
        quantity: holding.quantity,
      })),
    });
  }
  return entries;
}
