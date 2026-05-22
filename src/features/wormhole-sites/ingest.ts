import { eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { npcs, siteResources, sites, waves } from './schema';
import { parseSheetTab, type ParsedSite } from './sheet-parser';
import { csvUrlFor, SHEET_TABS } from './sheet-source';

export type IngestSummary = {
  sitesUpserted: number;
  wavesWritten: number;
  npcsWritten: number;
  resourcesWritten: number;
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

  // 3. Upsert + replace-children within a single transaction.
  const summary: IngestSummary = {
    sitesUpserted: 0,
    wavesWritten: 0,
    npcsWritten: 0,
    resourcesWritten: 0,
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
          s.resources.map((r) => ({
            siteId,
            orderInSite: r.orderInSite,
            resourceKind: r.resourceKind,
            resourceName: r.resourceName,
            units: r.units,
            volumeM3: r.volumeM3,
            iskPerM3: r.iskPerM3,
            totalIsk: r.totalIsk,
          })),
        );
        summary.resourcesWritten += s.resources.length;
      }
    }

    // 4. Prune sites whose row is no longer in the Sheet (scoped to fetched tabs only,
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

  return summary;
}

// Re-export for the CLI entry.
export { SHEET_TABS, csvUrlFor } from './sheet-source';
