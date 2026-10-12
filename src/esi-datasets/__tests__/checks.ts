import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import type {
  EsiDatasetEntry,
  EsiGateRuleId,
  EsiRouteDeclaration,
} from '@/lib/esi-datasets/types';

export type EsiDatasetCheckContext = {
  cronRoutes: ReadonlySet<string>;
  personalEntryPoints: ReadonlySet<string>;
  engineDatasets: ReadonlySet<string>;
};

export function isEsiMirrorTable(table: PgTable): boolean {
  return getTableConfig(table).columns.some(
    (column) =>
      /_refreshed_at$/.test(column.name)
      || column.name === 'stale_after'
      || column.name === 'fetched_at',
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
  if (entry.waiver !== undefined && entry.waiver.rationale.trim() === '') {
    return [`${entry.name}: waiver ${entry.waiver.rule} requires a rationale`];
  }
  return [];
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
  if (context.personalEntryPoints.has(entry.refreshOwner.name)) return null;
  return `unknown personal refresh owner ${entry.refreshOwner.name}`;
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

const isStored = (route: EsiRouteDeclaration): boolean => (route.mode ?? 'stored') === 'stored';

/** A lookup entry stores nothing: every route pass-through, no mirror table. */
function lookupFinding(entry: EsiDatasetEntry): string[] {
  if (entry.shape !== 'lookup') return [];
  const findings: string[] = [];
  for (const route of entry.routes) {
    if (route.mode !== 'pass-through') findings.push(`${entry.name}: lookup route ${route.route} must be pass-through`);
  }
  if (entry.mirrorTables.length > 0) findings.push(`${entry.name}: lookup dataset declares mirror tables`);
  return findings;
}

/**
 * A stored route's answer lands somewhere: in a declared mirror table, or
 * in the esi_responses row itself when the route keeps its body.
 */
function storedMirrorFinding(entry: EsiDatasetEntry): string[] {
  const stored = entry.routes.filter(isStored);
  if (stored.length === 0 || entry.mirrorTables.length > 0 || stored.every((route) => route.keepBody === true)) {
    return [];
  }
  return [`${entry.name}: stored routes need a mirror table or keepBody`];
}

function entryFindings(
  entry: EsiDatasetEntry,
  context: EsiDatasetCheckContext,
): string[] {
  return [
    ...metadataFindings(entry),
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
    ...lookupFinding(entry),
    ...storedMirrorFinding(entry),
  ];
}

/**
 * Validates placement over entries plus live-world name sets. Global
 * datasets name a live cron; personal datasets name a live entry point and
 * any cron backstop names a live route; engine owners name a live sync
 * dataset; lookups store nothing; and a stored route's answer has a mirror
 * table or keeps its body. Freshness has no rule here: CCP's Expires is
 * the one source, kept per route by the response store. A waiver
 * suppresses only its named rule and must retain a non-empty rationale.
 */
export function checkEntries(
  entries: readonly EsiDatasetEntry[],
  context: EsiDatasetCheckContext,
): string[] {
  return entries.flatMap((entry) => entryFindings(entry, context));
}

export const ESI_INFRASTRUCTURE_TABLES = [
  {
    table: 'esi_snapshots',
    reason:
      'Encrypted response-body transport cache governed by ETag/304 handling and retention pruning.',
  },
  {
    table: 'esi_responses',
    reason:
      'The response store: CCP\'s Expires, ETag and Last-Modified per declared route and holder, the one freshness source every stored dataset reads.',
  },
] as const;

export const CONVEX_ESI_HOMES = [
  { home: 'convex:characterLocation', entry: 'character_location' },
  { home: 'convex:characterLocationCovered', entry: 'character_location' },
  { home: 'convex:characterLocationOnline', entry: 'character_location' },
] as const;
