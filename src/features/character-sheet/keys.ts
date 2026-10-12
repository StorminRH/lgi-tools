import type { EsiStoreKey } from '@/data/esi-store';
import { eveTag, type EsiRoute } from '@/lib/esi-datasets/routes';
import { SHEET_SECTION_KEYS, SHEET_SECTIONS, TIER_ENTRY } from './sections';
import type { DirectSectionKey, DirectSectionSpec, SheetEndpoint, SheetPart, SheetSections } from './types';

/** The declared route each sheet endpoint reads, spelled once so the registry test can check every one. */
export const SHEET_ROUTES = {
  character: '/characters/{character_id}/',
  location: '/characters/{character_id}/location/',
  ship: '/characters/{character_id}/ship/',
  online: '/characters/{character_id}/online/',
  attributes: '/characters/{character_id}/attributes/',
  implants: '/characters/{character_id}/implants/',
  clones: '/characters/{character_id}/clones/',
  wallet: '/characters/{character_id}/wallet/',
  journal: '/characters/{character_id}/wallet/journal/',
  orders: '/characters/{character_id}/orders/',
} as const satisfies Record<SheetEndpoint, EsiRoute>;

/** The structure name lookup the structures section and the corp context both make, pass-through and never stored. */
export const STRUCTURE_LOOKUP_ROUTE = '/universe/structures/{structure_id}/' satisfies EsiRoute;

export function sheetEndpointKey(characterId: number, endpoint: SheetEndpoint): EsiStoreKey {
  return { route: SHEET_ROUTES[endpoint], holder: { kind: 'character', id: characterId } };
}

function partEndpoints<K extends DirectSectionKey>(spec: DirectSectionSpec<K>): SheetEndpoint[] {
  const parts = Object.keys(spec.parts) as SheetPart<K>[];
  return parts.map((part) => spec.parts[part].endpoint);
}

/** Every stored answer one direct section is built from: the section is due once any of them has expired. */
export function sectionKeys(characterId: number, key: DirectSectionKey): EsiStoreKey[] {
  const spec = SHEET_SECTIONS[key] as DirectSectionSpec<DirectSectionKey>;
  return partEndpoints(spec).map((endpoint) => sheetEndpointKey(characterId, endpoint));
}

/** The cache tags one character's sheet is served under: one per tier, since each tier's refresh clears its own. */
export function sheetTags(characterId: number): string[] {
  return Object.values(TIER_ENTRY).map((dataset) => eveTag(dataset, { kind: 'character', id: characterId }));
}

/**
 * The stored answers behind the sections a sheet holds data for. A denied
 * section made no read and the structures section is built from pass-through
 * lookups, so neither has an answer to expire; the sheet lives until the
 * earliest of the rest.
 */
export function heldSectionKeys(characterId: number, sections: SheetSections): EsiStoreKey[] {
  return SHEET_SECTION_KEYS.flatMap((key) => {
    if (key === 'structures') return [];
    const envelope = sections[key];
    return envelope === undefined || envelope.denied === true ? [] : sectionKeys(characterId, key);
  });
}
