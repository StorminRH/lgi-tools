import type { SecurityClass } from '@/data/eve-data/security';
import type { ChainPosition } from '../chain/intents';
import { pairKey } from '../lib/pair-key';
import type { LayoutFacts } from '../layout/layout-contract';

export const HALO_DRAWN_RINGS = 0;

export const HALO_FOGGED_RINGS = 0;

const HALO_MAX_SYSTEMS_PER_EXIT = 10;

const HALO_MAX_SYSTEMS_TOTAL = 150;

export interface HaloSystem {
  readonly systemId: number;

  readonly ring: number;

  readonly fogged: boolean;
}

export interface HaloLink {
  readonly a: number;
  readonly b: number;
}

export interface HaloDerivation {
  readonly systems: readonly HaloSystem[];
  readonly links: readonly HaloLink[];
}

export const EMPTY_HALO: HaloDerivation = { systems: [], links: [] };

export interface PlacedHaloSystem extends HaloSystem {
  readonly position: ChainPosition;
}

export interface PlacedHalo {
  readonly systems: readonly PlacedHaloSystem[];
  readonly links: readonly HaloLink[];
}

export const EMPTY_PLACED_HALO: PlacedHalo = { systems: [], links: [] };

export interface HaloLimits {
  readonly drawnRings: number;
  readonly foggedRings: number;
  readonly maxSystemsPerExit: number;
  readonly maxSystemsTotal: number;
}

export const HALO_PINNED_LIMITS: HaloLimits = {
  drawnRings: HALO_DRAWN_RINGS,
  foggedRings: HALO_FOGGED_RINGS,
  maxSystemsPerExit: HALO_MAX_SYSTEMS_PER_EXIT,
  maxSystemsTotal: HALO_MAX_SYSTEMS_TOTAL,
};

export interface HaloInput {

  readonly authoredSystems: readonly { readonly systemId: number; readonly order: number }[];

  readonly neighbours: (id: number) => readonly number[];

  readonly securityClassOf: (id: number) => SecurityClass | undefined;

  readonly limits?: HaloLimits;
}

interface HaloClaim {
  readonly ring: number;
  readonly parent: number;
}

interface HaloScan {
  readonly authoredIds: ReadonlySet<number>;
  readonly limits: HaloLimits;
  readonly neighbours: (id: number) => readonly number[];
  readonly claims: Map<number, HaloClaim>;
  readonly claimedPerExit: Map<number, number>;
}

function claimable(scan: HaloScan, exitId: number, neighbour: number): boolean {
  if (scan.authoredIds.has(neighbour) || scan.claims.has(neighbour)) return false;
  if ((scan.claimedPerExit.get(exitId) ?? 0) >= scan.limits.maxSystemsPerExit) {
    return false;
  }
  return scan.claims.size < scan.limits.maxSystemsTotal;
}

function expandExitFrontier(
  scan: HaloScan,
  exitId: number,
  frontier: readonly number[],
  ring: number,
): number[] {
  const next: number[] = [];
  for (const systemId of frontier) {
    for (const neighbour of scan.neighbours(systemId)) {
      if (!claimable(scan, exitId, neighbour)) continue;
      scan.claims.set(neighbour, { ring, parent: systemId });
      scan.claimedPerExit.set(exitId, (scan.claimedPerExit.get(exitId) ?? 0) + 1);
      next.push(neighbour);
    }
  }
  return next;
}

function scanClaims(
  scan: HaloScan,
  exits: readonly { readonly systemId: number }[],
  totalRings: number,
): void {
  const frontiers = new Map<number, readonly number[]>(
    exits.map((exit) => [exit.systemId, [exit.systemId]]),
  );
  for (let ring = 1; ring <= totalRings; ring += 1) {
    for (const exit of exits) {
      frontiers.set(
        exit.systemId,
        expandExitFrontier(scan, exit.systemId, frontiers.get(exit.systemId) ?? [], ring),
      );
    }
  }
}

function appendCrossLinks(
  scan: HaloScan,
  renderedInOrder: readonly number[],
  foggedIds: ReadonlySet<number>,
  linkedPairs: Set<string>,
  links: HaloLink[],
): void {
  const renderedIds = new Set([...scan.authoredIds, ...scan.claims.keys()]);
  for (const systemId of renderedInOrder) {
    for (const neighbour of scan.neighbours(systemId)) {
      if (!renderedIds.has(neighbour)) continue;
      if (foggedIds.has(systemId) && foggedIds.has(neighbour)) continue;
      const key = pairKey(systemId, neighbour);
      if (linkedPairs.has(key)) continue;
      linkedPairs.add(key);
      links.push({ a: systemId, b: neighbour });
    }
  }
}

export function deriveHalo(input: HaloInput): HaloDerivation {
  const limits = input.limits ?? HALO_PINNED_LIMITS;
  const totalRings = limits.drawnRings + limits.foggedRings;
  const authoredIds = new Set(input.authoredSystems.map((system) => system.systemId));

  const exits = [...input.authoredSystems]
    .sort((left, right) => left.order - right.order)
    .filter((system) => {
      const securityClass = input.securityClassOf(system.systemId);
      return securityClass !== undefined && securityClass !== 'wormhole';
    });
  if (exits.length === 0 || totalRings <= 0) return EMPTY_HALO;

  const scan: HaloScan = {
    authoredIds,
    limits,
    neighbours: input.neighbours,
    claims: new Map(),
    claimedPerExit: new Map(),
  };
  scanClaims(scan, exits, totalRings);

  const systems: HaloSystem[] = [];
  const links: HaloLink[] = [];
  const linkedPairs = new Set<string>();
  for (const [systemId, claim] of scan.claims) {
    systems.push({
      systemId,
      ring: claim.ring,
      fogged: claim.ring > limits.drawnRings,
    });
    links.push({ a: claim.parent, b: systemId });
    linkedPairs.add(pairKey(claim.parent, systemId));
  }

  const foggedIds = new Set(
    systems.filter((system) => system.fogged).map((system) => system.systemId),
  );
  const renderedInOrder = [
    ...exits.map((exit) => exit.systemId),
    ...systems.map((system) => system.systemId),
  ];
  appendCrossLinks(scan, renderedInOrder, foggedIds, linkedPairs, links);

  return { systems, links };
}

export function appendHaloFacts(facts: LayoutFacts, halo: HaloDerivation): LayoutFacts {
  if (halo.systems.length === 0) return facts;
  return {
    ...facts,
    systems: [
      ...facts.systems,
      ...halo.systems.map((system) => ({ systemId: system.systemId })),
    ],
    connections: [
      ...facts.connections,
      ...halo.links.map((link) => ({ fromSystemId: link.a, toSystemId: link.b })),
    ],
  };
}

export function haloSignature(halo: HaloDerivation): string {
  return [
    halo.systems
      .map((system) => `${system.systemId}:${system.ring}:${system.fogged ? 1 : 0}`)
      .join(','),
    halo.links.map((link) => `${link.a}>${link.b}`).join(','),
  ].join('#');
}
