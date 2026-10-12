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

const MODE_PRECEDENCE: Record<NonNullable<EsiRouteDeclaration['mode']>, number> = { stored: 0, 'pass-through': 1, convex: 2 };

function owningDeclaration(route: EsiRoute): DeclaredRoute {
  const declared = routeDeclarations(route);
  const owned = [...declared].sort(
    (a, b) => MODE_PRECEDENCE[a.declaration.mode ?? 'stored'] - MODE_PRECEDENCE[b.declaration.mode ?? 'stored'],
  )[0];
  if (owned === undefined) throw new Error(`Undeclared ESI route: ${route}`);
  return owned;
}

/**
 * The declaration the response store follows for `route`. A route the map
 * tracker also reads (location, ship, online) carries a `convex` declaration
 * beside the stored one; the stored one wins, then a pass-through one, and
 * only a route declared nowhere else is the tracker's alone.
 */
export function routeDeclaration(route: EsiRoute): EsiRouteDeclaration {
  return owningDeclaration(route).declaration;
}

/** The dataset whose stored copy `route` feeds: the one the store's declaration belongs to. */
export function routeDataset(route: EsiRoute): string {
  return owningDeclaration(route).dataset;
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

/** Next drops a longer tag with only a console warning, so a reader would never be cleared. */
const MAX_TAG_LENGTH = 256;

/**
 * The 'use cache' tag of a dataset's stored copy, `eve:<dataset>[:<holder>]`.
 * It is derived, never hand-written, so a reader and the write that clears
 * it cannot drift apart. Global datasets share one tag.
 */
export function eveTag(dataset: string, holder: EsiHolder = { kind: 'global' }): string {
  const suffix = holderTag(holder);
  const tag = suffix === null ? `eve:${dataset}` : `eve:${dataset}:${suffix}`;
  if (tag.length > MAX_TAG_LENGTH) throw new Error(`ESI cache tag exceeds ${MAX_TAG_LENGTH} characters: ${tag}`);
  return tag;
}
