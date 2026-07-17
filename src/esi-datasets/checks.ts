import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import {
  effectiveTtlMs,
  type EsiDatasetEntry,
  type EsiGateRuleId,
} from '@/lib/esi-datasets/types';

type EsiDatasetCheckContext = {
  cronRoutes: ReadonlySet<string>;
  deferredDatasets: ReadonlySet<string>;
  personalEntryPoints: ReadonlySet<string>;
  engineDatasets: ReadonlySet<string>;
};

/**
 * True when a Neon table carries an ESI-mirror freshness column
 * (`…_refreshed_at`, `stale_after`, or `fetched_at`). DB-free:
 * getTableConfig reads Drizzle metadata without opening a connection. This is
 * a safety net for the freshness-column pattern, not the full dataset census.
 */
export function isEsiMirrorTable(table: PgTable): boolean {
  return getTableConfig(table).columns.some(
    (column) =>
      /_refreshed_at$/.test(column.name)
      || column.name === 'stale_after'
      || column.name === 'fetched_at',
  );
}

/**
 * Returns reflected freshness tables neither claimed by a registry entry nor
 * declared as transport infrastructure. Kept as a pure set difference so the
 * gate's unregistered-mirror failure path is directly testable.
 */
export function findUnregisteredMirrors(
  flagged: readonly string[],
  claimed: ReadonlySet<string>,
  infrastructure: ReadonlySet<string>,
): string[] {
  return flagged.filter(
    (name) => !claimed.has(name) && !infrastructure.has(name),
  );
}

function ruleFinding(
  entry: EsiDatasetEntry,
  rule: EsiGateRuleId,
  violation: string | null,
): string[] {
  if (violation === null || entry.waiver?.rule === rule) return [];
  return [`${entry.name}: ${violation}`];
}

function metadataFindings(entry: EsiDatasetEntry): string[] {
  const findings: string[] = [];
  if (entry.waiver !== undefined && entry.waiver.rationale.trim() === '') {
    findings.push(
      `${entry.name}: waiver ${entry.waiver.rule} requires a rationale`,
    );
  }
  if (
    entry.ttlOverride !== undefined
    && entry.ttlOverride.rationale.trim() === ''
  ) {
    findings.push(`${entry.name}: TTL override requires a rationale`);
  }
  return findings;
}

function convexPlacementViolation(entry: EsiDatasetEntry): string | null {
  if (entry.store !== 'convex' || entry.collaborative) return null;
  const cacheSeconds =
    entry.upstream.kind === 'esi'
      ? entry.upstream.verifiedCacheSeconds
      : null;
  return cacheSeconds === null || cacheSeconds > 120
    ? 'Convex requires verified ESI cache <= 120s or collaborative data'
    : null;
}

function globalCronViolation(
  entry: EsiDatasetEntry,
  context: EsiDatasetCheckContext,
): string | null {
  if (entry.shape !== 'global-cron') return null;
  const route = entry.refreshOwner.route;
  if (route === null) return 'global-cron dataset has no cron route';
  return context.cronRoutes.has(route) ? null : `unknown cron route ${route}`;
}

function personalOwnerViolation(
  entry: EsiDatasetEntry,
  context: EsiDatasetCheckContext,
): string | null {
  if (entry.shape !== 'personal-on-view') return null;
  const ownerExists =
    entry.refreshOwner.kind === 'deferred-queue'
      ? context.deferredDatasets.has(entry.refreshOwner.dataset)
      : context.personalEntryPoints.has(entry.refreshOwner.name);
  if (ownerExists) return null;
  const owner =
    entry.refreshOwner.kind === 'deferred-queue'
      ? entry.refreshOwner.dataset
      : entry.refreshOwner.name;
  return `unknown personal refresh owner ${owner}`;
}

function cronBackstopViolation(
  entry: EsiDatasetEntry,
  context: EsiDatasetCheckContext,
): string | null {
  if (
    entry.shape !== 'personal-on-view'
    || entry.cronBackstopRoute === undefined
    || context.cronRoutes.has(entry.cronBackstopRoute)
  ) {
    return null;
  }
  return `unknown cron backstop ${entry.cronBackstopRoute}`;
}

function liveOwnerFinding(
  entry: EsiDatasetEntry,
  context: EsiDatasetCheckContext,
): string[] {
  if (
    entry.shape !== 'live'
    || context.engineDatasets.has(entry.refreshOwner.dataset)
  ) {
    return [];
  }
  return [`${entry.name}: unknown engine dataset ${entry.refreshOwner.dataset}`];
}

function ttlViolation(entry: EsiDatasetEntry): string | null {
  if (
    entry.upstream.kind !== 'esi'
    || entry.freshnessModel === 'expires-boundary'
    || entry.freshnessModel === 'cron-cadence'
  ) {
    return null;
  }
  if (entry.upstream.verifiedCacheSeconds === null) {
    return 'static freshness model requires a verified upstream cache time';
  }
  const upstreamMs = entry.upstream.verifiedCacheSeconds * 1000;
  const effectiveMs = effectiveTtlMs(entry);
  return effectiveMs === null || effectiveMs < upstreamMs
    ? `effective TTL ${effectiveMs ?? 'none'}ms is below upstream ${upstreamMs}ms`
    : null;
}

function entryFindings(
  entry: EsiDatasetEntry,
  context: EsiDatasetCheckContext,
): string[] {
  return [
    ...metadataFindings(entry),
    ...ruleFinding(
      entry,
      'convex-cache-bound',
      convexPlacementViolation(entry),
    ),
    ...ruleFinding(
      entry,
      'global-cron-names-route',
      globalCronViolation(entry, context),
    ),
    ...ruleFinding(
      entry,
      'personal-names-owner',
      personalOwnerViolation(entry, context),
    ),
    ...ruleFinding(
      entry,
      'personal-backstop-names-route',
      cronBackstopViolation(entry, context),
    ),
    ...liveOwnerFinding(entry, context),
    ...ruleFinding(
      entry,
      'ttl-at-least-upstream',
      ttlViolation(entry),
    ),
  ];
}

/**
 * Validates placement and freshness over entries plus live-world name sets.
 * Convex is limited to ≤120-second ESI data unless collaborative; global
 * datasets name a live cron; personal datasets name a queue handle or entry
 * point and any cron backstop names a live route; engine owners name a live
 * sync dataset; and static TTLs never undercut upstream. A waiver suppresses
 * only its named rule and must retain a non-empty rationale.
 */
export function checkEntries(
  entries: readonly EsiDatasetEntry[],
  context: EsiDatasetCheckContext,
): string[] {
  return entries.flatMap((entry) => entryFindings(entry, context));
}

/**
 * Durable Neon tables the mirror scan sees that are ESI transport
 * infrastructure rather than datasets. Explicit reasons keep these exclusions
 * auditable instead of silently subtracting them from reflection.
 */
export const ESI_INFRASTRUCTURE_TABLES = [
  {
    table: 'esi_snapshots',
    reason:
      'Encrypted response-body transport cache governed by ETag/304 handling and retention pruning.',
  },
] as const;

/**
 * ESI-fed homes outside Neon, invisible to Drizzle reflection, mapped to the
 * registry entry that owns their placement and freshness declaration.
 */
export const CONVEX_ESI_HOMES = [
  { home: 'convex:characterOnline', entry: 'online_status' },
] as const;
