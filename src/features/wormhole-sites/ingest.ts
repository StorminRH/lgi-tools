import { eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getTypesByNames } from '@/data/eve-data/queries';
import { refreshPrices } from '@/data/market-prices/ingest';
import { resolveAlias } from './resource-aliases';
import { npcs, siteResources, sites, waves } from './schema';
import { parseSheetTab, type ParsedSite } from './sheet-parser';
import { csvUrlFor, SHEET_TABS } from './sheet-source';

export type IngestSummary = {
  sitesUpserted: number;
  wavesWritten: number;
  npcsWritten: number;
  resourcesWritten: number;
  resourcesWithTypeId: number;
  resourcesWithoutTypeId: number;
  distinctTypeIds: number;
  pricesFetched: number;
  pricesWritten: number;
  pricesFailed: boolean;
  sitesRemoved: number;
};

export type IngestOptions = {
  pubKey: string;
  prune?: boolean;
};

export async function runIngest(
  db: PostgresJsDatabase,
  opts: IngestOptions,
): Promise<IngestSummary> {
  const { pubKey, prune = true } = opts;

  // 1. Fetch every tab's CSV in parallel.
  const fetched = await Promise.all(
    SHEET_TABS.map(async (tab) => {
      const url = csvUrlFor(pubKey, tab.gid);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch failed for ${tab.label} (gid=${tab.gid}): ${res.status}`);
      const text = await res.text();
      return { tab, text };
    }),
  );

  // 2. Parse all tabs into normalized site records.
  const allSites: ParsedSite[] = fetched.flatMap(({ tab, text }) => parseSheetTab(text, tab));
  if (allSites.length === 0) throw new Error('Parsed 0 sites — refusing to wipe the DB.');

  // 3. Resolve resource names to Eve type IDs BEFORE the transaction so we
  // don't hold row locks while reading eve-data. Degrades silently when
  // eve_types is empty: every name yields typeId = null, ingest proceeds,
  // UI falls back to sheet values.
  const sheetNameToSdeName = new Map<string, string>();
  for (const site of allSites) {
    for (const r of site.resources) {
      const sde = resolveAlias(r.resourceName);
      if (sde) sheetNameToSdeName.set(r.resourceName.trim().toLowerCase(), sde);
    }
  }
  const distinctSdeNames = [...new Set(sheetNameToSdeName.values())];
  const typesByName = await getTypesByNames(distinctSdeNames);
  // Build a map from the Sheet's (normalized) resource name → resolved typeId.
  const sheetNameToTypeId = new Map<string, number>();
  for (const [lowerSheet, sde] of sheetNameToSdeName) {
    const t = typesByName.get(sde.toLowerCase());
    if (t) sheetNameToTypeId.set(lowerSheet, t.id);
  }

  if (sheetNameToTypeId.size === 0 && distinctSdeNames.length > 0) {
    console.warn(
      `[ingest] Alias map produced ${distinctSdeNames.length} SDE names but eve_types resolved 0 — is the SDE ingested? Continuing with typeId = null for all resources.`,
    );
  }

  // 4. Upsert + replace-children within a single transaction.
  const summary: IngestSummary = {
    sitesUpserted: 0,
    wavesWritten: 0,
    npcsWritten: 0,
    resourcesWritten: 0,
    resourcesWithTypeId: 0,
    resourcesWithoutTypeId: 0,
    distinctTypeIds: 0,
    pricesFetched: 0,
    pricesWritten: 0,
    pricesFailed: false,
    sitesRemoved: 0,
  };

  await db.transaction(async (tx) => {
    const keepIds = new Set<number>();

    for (const s of allSites) {
      const [row] = await tx
        .insert(sites)
        .values({
          sourceTab: s.sourceTab,
          name: s.name,
          siteType: s.siteType,
          signatureLabel: s.signatureLabel,
          wormholeClass: s.wormholeClass,
          blueLootIsk: s.blueLootIsk,
          iskPerEhp: s.iskPerEhp,
          resourceValueIsk: s.resourceValueIsk,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [sites.sourceTab, sites.name],
          set: {
            siteType: s.siteType,
            signatureLabel: s.signatureLabel,
            wormholeClass: s.wormholeClass,
            blueLootIsk: s.blueLootIsk,
            iskPerEhp: s.iskPerEhp,
            resourceValueIsk: s.resourceValueIsk,
            updatedAt: new Date(),
          },
        })
        .returning({ id: sites.id });
      const siteId = row.id;
      keepIds.add(siteId);
      summary.sitesUpserted++;

      // Replace children: cascade FKs drop npcs when waves go.
      await tx.delete(waves).where(eq(waves.siteId, siteId));
      await tx.delete(siteResources).where(eq(siteResources.siteId, siteId));

      for (const w of s.waves) {
        const [wRow] = await tx
          .insert(waves)
          .values({
            siteId,
            waveNumber: w.waveNumber,
            waveLabel: w.waveLabel,
            ewScram: w.ewScram,
            ewWeb: w.ewWeb,
            ewNeut: w.ewNeut,
            ewRrep: w.ewRrep,
            dpsTotal: w.dpsTotal,
            alphaTotal: w.alphaTotal,
            ehpTotal: w.ehpTotal,
          })
          .returning({ id: waves.id });
        const waveId = wRow.id;
        summary.wavesWritten++;

        if (w.npcs.length > 0) {
          await tx.insert(npcs).values(
            w.npcs.map((n) => ({
              waveId,
              orderInWave: n.orderInWave,
              triggerLabel: n.triggerLabel,
              quantity: n.quantity,
              sleeperName: n.sleeperName,
              sleeperClassCode: n.sleeperClassCode,
              scram: n.scram,
              web: n.web,
              neut: n.neut,
              rrep: n.rrep,
              sig: n.sig,
              speed: n.speed,
              distance: n.distance,
              velocity: n.velocity,
              dps: n.dps,
              alpha: n.alpha,
              ehp: n.ehp,
            })),
          );
          summary.npcsWritten += w.npcs.length;
        }
      }

      if (s.resources.length > 0) {
        await tx.insert(siteResources).values(
          s.resources.map((r) => {
            const typeId = sheetNameToTypeId.get(r.resourceName.trim().toLowerCase()) ?? null;
            if (typeId != null) summary.resourcesWithTypeId++;
            else summary.resourcesWithoutTypeId++;
            return {
              siteId,
              orderInSite: r.orderInSite,
              resourceKind: r.resourceKind,
              resourceName: r.resourceName,
              units: r.units,
              volumeM3: r.volumeM3,
              iskPerM3: r.iskPerM3,
              totalIsk: r.totalIsk,
              typeId,
            };
          }),
        );
        summary.resourcesWritten += s.resources.length;
      }
    }

    // 5. Prune sites whose row is no longer in the Sheet (scoped to fetched tabs only,
    // so a partial outage can't clear unrelated rows).
    if (prune) {
      const fetchedTabs = SHEET_TABS.map((t) => t.label);
      const existing = await tx
        .select({ id: sites.id })
        .from(sites)
        .where(inArray(sites.sourceTab, fetchedTabs));
      const stale = existing.map((r) => r.id).filter((id) => !keepIds.has(id));
      if (stale.length > 0) {
        const removed = await tx
          .delete(sites)
          .where(inArray(sites.id, stale))
          .returning({ id: sites.id });
        summary.sitesRemoved = removed.length;
      }
    }
  });

  // 6. After the transaction commits, refresh market prices for every type
  // ID we resolved. Network call to Fuzzwork — wrap in try/catch so a
  // transient outage never throws past the ingest boundary. Resource rows
  // are already persisted; the UI degrades to sheet values on price miss.
  const distinctTypeIds = [...new Set(sheetNameToTypeId.values())];
  summary.distinctTypeIds = distinctTypeIds.length;
  if (distinctTypeIds.length > 0) {
    try {
      const priceSummary = await refreshPrices(db, distinctTypeIds);
      summary.pricesFetched = priceSummary.fetched;
      summary.pricesWritten = priceSummary.written;
    } catch (err) {
      summary.pricesFailed = true;
      console.error('[ingest] refreshPrices failed; sheet values will be used as fallback:', err);
    }
  }

  return summary;
}

// Re-export for the CLI entry.
export { SHEET_TABS, csvUrlFor } from './sheet-source';
