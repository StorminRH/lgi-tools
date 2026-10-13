/**
 * ESI paths the map tracker reads, spelled once with the registry's
 * trailing slash so a registry-conformance test covers every builder. It
 * imports nothing: the Convex isolate bundles platform/esi.
 */

export function characterLocationPath(characterId: number): string {
  return `/characters/${characterId}/location/`;
}

export function characterShipPath(characterId: number): string {
  return `/characters/${characterId}/ship/`;
}

export function characterOnlinePath(characterId: number): string {
  return `/characters/${characterId}/online/`;
}
