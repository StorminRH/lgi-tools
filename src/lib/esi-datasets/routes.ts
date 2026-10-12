import { ESI_DATASET_ENTRIES } from './entries';
import type { EsiHolder, EsiRouteDeclaration } from './types';

/** Every route the registry declares, as a literal union: an undeclared route fails typecheck. */
export type EsiRoute = (typeof ESI_DATASET_ENTRIES)[number]['routes'][number]['route'];

export interface DeclaredRoute {
  readonly dataset: string;
  readonly declaration: EsiRouteDeclaration;
}

function indexDeclarations(): ReadonlyMap<string, readonly DeclaredRoute[]> {
  const byRoute = new Map<string, DeclaredRoute[]>();
  for (const entry of ESI_DATASET_ENTRIES) {
    for (const declaration of entry.routes) {
      const declared = byRoute.get(declaration.route) ?? [];
      declared.push({ dataset: entry.name, declaration });
      byRoute.set(declaration.route, declared);
    }
  }
  return byRoute;
}

const DECLARATIONS = indexDeclarations();

/** Every declaration of `route`, across datasets, in registry order. */
export function routeDeclarations(route: string): readonly DeclaredRoute[] {
  return DECLARATIONS.get(route) ?? [];
}

/**
 * The declaration the response store follows for `route`. A route the map
 * tracker also reads (location, ship, online) carries a `convex` declaration
 * beside the stored one; the stored one wins, and only a route declared
 * nowhere else as stored or pass-through is the tracker's alone.
 */
export function routeDeclaration(route: EsiRoute): EsiRouteDeclaration {
  const declared = routeDeclarations(route);
  const owned = declared.find((candidate) => candidate.declaration.mode !== 'convex') ?? declared[0];
  if (owned === undefined) throw new Error(`Undeclared ESI route: ${route}`);
  return owned.declaration;
}

/** The identity part of a holder's cache tag; global holders add nothing. */
export function holderTag(holder: EsiHolder): string | null {
  switch (holder.kind) {
    case 'global':
      return null;
    case 'character':
    case 'corporation':
      return `${holder.kind}:${holder.id}`;
    case 'user-corporation':
      return `${holder.kind}:${holder.userId}:${holder.id}`;
  }
}

/**
 * The 'use cache' tag of a dataset's stored copy, `eve:<dataset>[:<holder>]`.
 * It is derived, never hand-written, so a reader and the write that clears
 * it cannot drift apart. Global datasets share one tag.
 */
export function eveTag(dataset: string, holder: EsiHolder = { kind: 'global' }): string {
  const suffix = holderTag(holder);
  return suffix === null ? `eve:${dataset}` : `eve:${dataset}:${suffix}`;
}
