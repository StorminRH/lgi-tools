import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { internal } from './_generated/api';
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server';
import { readOriginConnections } from './lib/mapConnectionLookup';
import { insertStaticPlaceholder } from './lib/mapStaticClaim';
import { findSystem } from './lib/mapSystemLookup';

export const STATIC_BACKFILL_BATCH = 32;

const SKIPPED_NOTE = 'static placeholders skipped';

type StaticCodesLoad =
  | { kind: 'codes'; codes: string[] }
  | { kind: 'skip' };

type LiveSystemRef = {
  readonly mapId: string;
  readonly systemId: number;
};

type LiveSystemsPage = {
  readonly page: LiveSystemRef[];
  readonly continueCursor: string;
  readonly isDone: boolean;
};

type BackfillResult = {
  readonly systems: number;
  readonly inserted: number;
  readonly cursor: string;
  readonly hasMore: boolean;
};

function uniqueStaticCodes(codes: readonly string[]): string[] {
  return [...new Set(codes.filter((code) => code.length > 0))];
}

function systemStaticsUrl(siteUrl: string, systemId: number): string {
  const origin = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
  return `${origin}/api/universe/statics/${systemId}`;
}

function parseStaticsPayload(value: unknown): string[] | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('statics' in value) || !Array.isArray(value.statics)) return null;
  if (!value.statics.every((code) => typeof code === 'string')) return null;
  return uniqueStaticCodes(value.statics);
}

function skipStaticPlaceholders(
  reason: string,
  detail: { readonly mapId?: string; readonly systemId?: number },
): void {
  console.warn(JSON.stringify({ note: SKIPPED_NOTE, reason, ...detail }));
}

function resolveBackfillBatch(batch: number | undefined): number {
  if (batch === undefined || !Number.isInteger(batch) || batch < 1) {
    return STATIC_BACKFILL_BATCH;
  }
  return Math.min(batch, STATIC_BACKFILL_BATCH);
}

async function loadSystemStaticCodes(systemId: number): Promise<StaticCodesLoad> {
  const siteUrl = process.env.SITE_URL;
  if (siteUrl === undefined) {
    skipStaticPlaceholders('missing SITE_URL', { systemId });
    return { kind: 'skip' };
  }
  try {
    const response = await fetchWithTimeout(systemStaticsUrl(siteUrl, systemId));
    if (!response.ok) {
      skipStaticPlaceholders(`HTTP ${response.status}`, { systemId });
      return { kind: 'skip' };
    }
    const codes = parseStaticsPayload(await response.json());
    if (codes === null) {
      skipStaticPlaceholders('invalid statics payload', { systemId });
      return { kind: 'skip' };
    }
    return { kind: 'codes', codes };
  } catch {
    skipStaticPlaceholders('fetch failed', { systemId });
    return { kind: 'skip' };
  }
}

export async function ensureStaticPlaceholders(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.mapStatics.fetchSystemStatics, {
    mapId,
    systemId,
  });
}

export const listLiveSystemsPage = internalQuery({
  args: {
    mapId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { mapId, paginationOpts }): Promise<LiveSystemsPage> => {
    const result = mapId === undefined
      ? await ctx.db.query('mapSystems').paginate(paginationOpts)
      : await ctx.db
        .query('mapSystems')
        .withIndex('by_map', (q) => q.eq('mapId', mapId))
        .paginate(paginationOpts);
    return {
      page: result.page
        .filter((row) => !isTombstoned(row))
        .map((row) => ({ mapId: row.mapId, systemId: row.systemId })),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const applyStaticPlaceholders = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    codes: v.array(v.string()),
  },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, { mapId, systemId, codes }) => {
    const system = await findSystem(ctx, mapId, systemId);
    if (system === null || isTombstoned(system)) return { inserted: 0 };
    const existing = await readOriginConnections(ctx, mapId, systemId);
    const claimed = new Set<string>();
    for (const row of existing) {
      if (isTombstoned(row) || row.staticCode === undefined) continue;
      claimed.add(row.staticCode);
    }
    const seatOrderAt = Date.now();
    let inserted = 0;
    for (const code of uniqueStaticCodes(codes)) {
      if (claimed.has(code)) continue;
      await insertStaticPlaceholder(ctx, { mapId, systemId, code, seatOrderAt });
      claimed.add(code);
      inserted += 1;
    }
    return { inserted };
  },
});

export const fetchSystemStatics = internalAction({
  args: { mapId: v.string(), systemId: v.number() },
  handler: async (ctx, { mapId, systemId }) => {
    const loaded = await loadSystemStaticCodes(systemId);
    if (loaded.kind === 'skip') return;
    await ctx.runMutation(internal.mapStatics.applyStaticPlaceholders, {
      mapId,
      systemId,
      codes: loaded.codes,
    });
  },
});

export const backfillStaticPlaceholders = internalAction({
  args: {
    mapId: v.optional(v.string()),
    cursor: v.optional(v.string()),
    batch: v.optional(v.number()),
  },
  returns: v.object({
    systems: v.number(),
    inserted: v.number(),
    cursor: v.string(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args): Promise<BackfillResult> => {
    const page: LiveSystemsPage = await ctx.runQuery(
      internal.mapStatics.listLiveSystemsPage,
      {
        ...(args.mapId === undefined ? {} : { mapId: args.mapId }),
        paginationOpts: {
          numItems: resolveBackfillBatch(args.batch),
          cursor: args.cursor ?? null,
        },
      },
    );
    let inserted = 0;
    for (const system of page.page) {
      const loaded = await loadSystemStaticCodes(system.systemId);
      if (loaded.kind === 'skip') continue;
      const result = await ctx.runMutation(internal.mapStatics.applyStaticPlaceholders, {
        mapId: system.mapId,
        systemId: system.systemId,
        codes: loaded.codes,
      });
      inserted += result.inserted;
    }
    return {
      systems: page.page.length,
      inserted,
      cursor: page.continueCursor,
      hasMore: !page.isDone,
    };
  },
});
