// The k-space gate halo: pure, deterministic derivation of the neighbor
// systems fanning out from every authored k-space system, over the static
// client gate-adjacency asset (4.0.4.2.3 OW3, contract DC-1/DC-2).
//
// Everything here is presentation derived from synchronized truth plus a
// static asset — no document is ever written for a halo system (HC-1), and
// nothing here authors anything (HC-2). Identical inputs yield byte-identical
// output on every client: the ring-by-ring scan iterates exits in authored
// creation order and neighbours in the asset's sorted order, so two clients
// holding the same map derive the same halo without exchanging a byte.
//
// J-space systems have no gate adjacency in the asset, so the halo acts only
// outside wormhole space by construction; an authored J-space chain simply
// contributes nothing.
import type { SecurityClass } from '@/data/eve-data/security';
import type { ChainPosition } from '../chain/intents';
import type { LayoutFacts } from '../layout/layout-contract';

/**
 * Ring depths drawn as visible halo systems. Pinned constant tuned at the
 * G-1 gate; no runtime configuration surface (operator direction, plan PD-2).
 */
export const HALO_DRAWN_RINGS = 2;

/** Ring depths placed under fog beyond the drawn rings; see `HALO_DRAWN_RINGS`. */
export const HALO_FOGGED_RINGS = 1;

/** Hard cap on systems any single authored exit may claim. */
export const HALO_MAX_SYSTEMS_PER_EXIT = 60;

/**
 * Hard aggregate cap across every exit, so a many-exit chain's halo load has
 * a bound the frame-budget proof can pin. Truncation is deterministic:
 * shortest depth first, then authored-exit creation order.
 */
export const HALO_MAX_SYSTEMS_TOTAL = 150;

/** One derived halo system: its shortest gate distance and fog placement. */
export interface HaloSystem {
  readonly systemId: number;
  /** Shortest gate distance from any authored k-space system (1-based). */
  readonly ring: number;
  /** True for rings beyond `HALO_DRAWN_RINGS` — placed, but under the fog. */
  readonly fogged: boolean;
}

/** One discovered gate link between two rendered (authored or halo) systems. */
export interface HaloLink {
  readonly a: number;
  readonly b: number;
}

/** The full derivation: systems in claim order, links claim-first. */
export interface HaloDerivation {
  readonly systems: readonly HaloSystem[];
  readonly links: readonly HaloLink[];
}

/** The empty derivation — stable identity for the no-assets/no-exits renders. */
export const EMPTY_HALO: HaloDerivation = { systems: [], links: [] };

/** One kernel-placed halo system, ready for the canvas node builder. */
export interface PlacedHaloSystem extends HaloSystem {
  readonly position: ChainPosition;
}

/** The placed halo the canvas merges: systems in claim order plus gate links. */
export interface PlacedHalo {
  readonly systems: readonly PlacedHaloSystem[];
  readonly links: readonly HaloLink[];
}

/** The empty placed halo — stable identity before the first kernel reply. */
export const EMPTY_PLACED_HALO: PlacedHalo = { systems: [], links: [] };

/** The scan depths the pinned constants demand; injectable for extent tests. */
export interface HaloLimits {
  readonly drawnRings: number;
  readonly foggedRings: number;
  readonly maxSystemsPerExit: number;
  readonly maxSystemsTotal: number;
}

const PINNED_LIMITS: HaloLimits = {
  drawnRings: HALO_DRAWN_RINGS,
  foggedRings: HALO_FOGGED_RINGS,
  maxSystemsPerExit: HALO_MAX_SYSTEMS_PER_EXIT,
  maxSystemsTotal: HALO_MAX_SYSTEMS_TOTAL,
};

/** Everything one derivation reads. All lookups must be pure and stable. */
export interface HaloInput {
  /** Authored systems in creation order (`order` is the creation index). */
  readonly authoredSystems: readonly { readonly systemId: number; readonly order: number }[];
  /** Sorted gate neighbours from the static asset; `[]` for unknown ids. */
  readonly neighbours: (id: number) => readonly number[];
  /** The one k-space/J-space owner's verdict; `undefined` for unknown ids. */
  readonly securityClassOf: (id: number) => SecurityClass | undefined;
  /** Test-only extent override; production always uses the pinned constants. */
  readonly limits?: HaloLimits;
}

function undirectedPairKey(a: number, b: number): string {
  return a < b ? `${a}>${b}` : `${b}>${a}`;
}

/** One claimed system's provenance during the scan. */
interface HaloClaim {
  readonly ring: number;
  readonly parent: number;
}

/** The mutable working state one scan reads and grows. */
interface HaloScan {
  readonly authoredIds: ReadonlySet<number>;
  readonly limits: HaloLimits;
  readonly neighbours: (id: number) => readonly number[];
  readonly claims: Map<number, HaloClaim>;
  readonly claimedPerExit: Map<number, number>;
}

/** Whether one exit may still claim this neighbour under both caps. */
function claimable(scan: HaloScan, exitId: number, neighbour: number): boolean {
  if (scan.authoredIds.has(neighbour) || scan.claims.has(neighbour)) return false;
  if ((scan.claimedPerExit.get(exitId) ?? 0) >= scan.limits.maxSystemsPerExit) {
    return false;
  }
  return scan.claims.size < scan.limits.maxSystemsTotal;
}

/** Expands one exit's frontier by one ring, claiming what the caps allow. */
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

/**
 * The ring-by-ring claim scan. Per-exit frontiers advance in lockstep, one
 * ring at a time, so a system reachable from two exits lands at its globally
 * shortest distance and the caps truncate shortest-depth-first, then by exit
 * creation order.
 */
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

/**
 * Cross-links: every remaining gate adjacency between rendered systems,
 * scanned in render order (authored exits, then halo claim order) with
 * sorted neighbours — deterministic, deduplicated, and never fogged-to-fogged
 * (a line both of whose ends sit under fog is invisible by construction).
 */
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
      const pairKey = undirectedPairKey(systemId, neighbour);
      if (linkedPairs.has(pairKey)) continue;
      linkedPairs.add(pairKey);
      links.push({ a: systemId, b: neighbour });
    }
  }
}

/**
 * Derives the halo: a ring-by-ring BFS from every authored k-space system
 * over the gate adjacency, claiming each discovered system once at its
 * shortest gate distance (ties go to the exit earliest in authored creation
 * order), capped per exit and in aggregate.
 *
 * Link emission order is load-bearing for placement: each halo system's CLAIM
 * link (from the ring-below system that discovered it) is emitted first, in
 * claim order, so the layout kernel's creation-order tree replay attaches
 * every halo system at its shortest distance. Remaining adjacency between
 * rendered systems follows as cross-links — including gate adjacency between
 * two authored k-space systems.
 *
 * Unknown system ids (absent from the asset) simply contribute nothing.
 */
export function deriveHalo(input: HaloInput): HaloDerivation {
  const limits = input.limits ?? PINNED_LIMITS;
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
    linkedPairs.add(undirectedPairKey(claim.parent, systemId));
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

/**
 * Appends the halo to the layout facts, after every authored entry, so the
 * kernel places halo systems like any other node while the authored tree —
 * root above all — is untouched (creation-order replay only ever appends).
 */
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

/**
 * A content fingerprint of one derivation for the layout post key: the halo
 * is structural layout input, so a membership change (the adjacency asset
 * landing, an exit authored) must re-post even when the authored signature
 * alone is unchanged. Separators cannot occur in numeric ids, so distinct
 * content never collides.
 */
export function haloSignature(halo: HaloDerivation): string {
  return [
    halo.systems
      .map((system) => `${system.systemId}:${system.ring}:${system.fogged ? 1 : 0}`)
      .join(','),
    halo.links.map((link) => `${link.a}>${link.b}`).join(','),
  ].join('#');
}
