## Wormhole Sites

The wormhole sites tool is the first feature that made LGI.tools feel useful instead of theoretical.

It is also the first feature that taught me a rule I kept reusing later: reference data is still architecture. It can look like a simple table of names and ISK values, but once the app depends on it, I need to know who owns it, how it can be corrected, what parts are derived, and which values are live estimates rather than stable facts.

The first version leaned on a community-maintained Google Sheet. That was the right starting point. EVE wormhole sites are full of domain-specific details: combat waves, sleeper names, triggers, blue-loot estimates, ore and gas resources, relic and data cans, and class ranges that are obvious to experienced pilots but not obvious to a database schema. Borrowing the Sheet let the feature exist before I had a full data pipeline.

The problem was that the Sheet was still acting like the authority. A routine ingest could delete and reinsert rows, which meant any local correction I made later could be silently wiped out. [PR #1](https://github.com/StorminRH/lgi-tools/pull/1) changed that boundary. The Sheet became a historical seed, and Postgres became the source of truth for the catalogue. The schema still preserves some Sheet vocabulary, like `sourceTab` and `signatureLabel`, because provenance is useful. But the app no longer treats the Sheet as a live dependency.<sup><a href="#code-sites-schema">1</a></sup>

That ownership decision showed up again in the combat numbers. The Sheet carried precomputed DPS, EHP, alpha, and EWAR totals. They were convenient, but they were also frozen outputs. If the Sheet’s formula drifted, or if a single aggregate was stale, the app would preserve the wrong number forever. [PR #2](https://github.com/StorminRH/lgi-tools/pull/2) moved those stats out of the site seed and into the SDE-backed NPC stat layer. The site tables now keep the join key, `typeId`, while the query layer computes the NPC and wave stats from raw EVE attributes.<sup><a href="#code-sites-schema">1</a></sup><sup><a href="#code-sites-combat">2</a></sup>

That was one of the better early corrections. It kept the wire format mostly stable for the UI, but changed where the truth came from. The site catalogue still says which Sleeper appears in which wave. The combat math layer says what that Sleeper does. Those are different responsibilities, and the code now treats them that way.

The current query shape follows that split. A site detail read starts with the local catalogue, fetches waves and resources in parallel, then fetches NPC rows and batches the distinct `typeId`s through the NPC-stats layer. The wave aggregate is rebuilt from that derived combat data before the response is assembled. The structural read is cached as deploy-static because the catalogue only changes when the repo ships a new seed or migration. Live market values are layered separately.<sup><a href="#code-sites-catalog-query">3</a></sup>

Gas sites forced one of the smaller but useful domain corrections. Their stored `wormholeClass` is not enough, because the name encodes a spawn range: Perimeter, Frontier, Core. The class filter now treats gas sites differently, deriving the range from the name and filtering in JavaScript after the small catalogue read. That is less “pure database query,” but it is more faithful to the game data. With roughly seventy rows, clarity wins over pretending every rule belongs in SQL.<sup><a href="#code-sites-class-filter">4</a></sup>

The live layer is intentionally narrow. Ore and gas rows can take a Jita price overlay when they have a resolved `typeId`, a positive unit count, and a matching SDE type row. The overlay uses the market-price slice, computes resource ISK from units and the 5-percent buy price, and falls back to the Sheet-seeded total when a live value is missing. Combat blue-loot stays static for now. I deferred “live blue loot” because the Sheet did not contain proper drop quantities, only an already-priced total. Guessing a drop table would have made the number look more official than it was.<sup><a href="#code-sites-live-overlay">5</a></sup>

[PR #63](https://github.com/StorminRH/lgi-tools/pull/63) made that live pricing visible in the interaction model. Opening an ore or gas site now confirms its resource prices through the shared refresh-on-view engine, then updates the resource rows, footer total, and card headline together. The key detail is that the refresh is gated by opening the site. Browsing a long list of collapsed cards should not fan out dozens of ESI calls just because the page exists. The static site facts stay in the prerendered shell; only the live estimates shimmer and settle.<sup><a href="#code-sites-refresh-on-view">6</a></sup>

The page itself went through the same kind of correction. At first, it was easy to render every card with every wave and every NPC breakdown up front. That worked when I was looking at a small feature, but it did not scale well once the list had card view, table view, live prices, filters, and richer combat detail. [PR #115](https://github.com/StorminRH/lgi-tools/pull/115) changed the default cost: render the summary first, and mount the heavy detail body only when a card or table row is opened. The individual site page still renders the full detail server-side, because that page is meant to be crawlable and shareable. The index does not need to pay for every hidden wave tree on first paint.<sup><a href="#code-sites-lazy-detail">7</a></sup>

The filtering layer is another place where I had to separate concerns. The server loads and prices the whole catalogue once, then hands server-rendered card and table nodes to a client filter layout. The client owns class filters, type filters, the cards/table preference, and the detail-mode preference. That keeps the page from turning every filter click into a new server fetch, while still letting the server own the expensive data assembly and live price seed.<sup><a href="#code-sites-page">8</a></sup><sup><a href="#code-sites-filter-layout">9</a></sup>

The table view from [PR #24](https://github.com/StorminRH/lgi-tools/pull/24) came from a usability problem: cards are good for browsing, but they are not the best way to compare all sites quickly. The table can sort by the important summary fields and expand a row into the same detail body the cards use. That reuse matters. Two views should not mean two interpretations of a site. If the card and table disagree, the feature is teaching the user to mistrust the tool.

Later UI passes kept pushing the same rule. [PR #138](https://github.com/StorminRH/lgi-tools/pull/138) added Sleeper ship-class summaries to the card header, derived from the already-loaded wave/NPC tree instead of another query. [PR #139](https://github.com/StorminRH/lgi-tools/pull/139) added the lightbox mode, but it still reuses the same card header and detail body. The UI can get easier to read without inventing another source of truth.<sup><a href="#code-sites-ship-summary">10</a></sup><sup><a href="#code-sites-lightbox">11</a></sup>

The public API followed the same cleanup. [PR #54](https://github.com/StorminRH/lgi-tools/pull/54) routed the JSON endpoints through the cached query paths the pages already use. The list endpoint returns the deploy-static catalogue shape. The single-site endpoint uses the priced detail read, so it has the same freshness model as the page instead of doing its own direct overlay work. That is less exciting than a new feature, but it is the kind of consistency that keeps a public API from becoming a second implementation.<sup><a href="#code-sites-api">12</a></sup>

Looking back, the wormhole sites feature is where a lot of the later architecture first appeared in smaller form. The Sheet was useful, but the repo had to take ownership. Precomputed stats were useful, but the repo had to derive them from raw game data. Static catalogue reads were useful, but live prices had to be layered carefully. Expanding every detail up front was simple, but the page needed to pay only for what the user opened.

That is the lesson I carried forward: do not let “reference data” become a junk drawer. The stable facts, derived combat math, live estimates, UI presentation, and public API all need boundaries. Once those boundaries exist, AI can help fill in the feature without being allowed to blur what each number means.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-sites-schema" file="src/features/wormhole-sites/schema.ts" lines="45-63,65-87,106-128,130-170" lang="ts" -->
```ts id="86n2e6"
export const sites = pgTable(
  'sites',
  {
    id: serial('id').primaryKey(),
    sourceTab: text('source_tab').notNull(),
    name: text('name').notNull(),
    siteType: siteTypeEnum('site_type').notNull(),
    signatureLabel: text('signature_label').notNull(),
    wormholeClass: wormholeClassEnum('wormhole_class'),
    blueLootIsk: bigint('blue_loot_isk', { mode: 'number' }),
    iskPerEhp: integer('isk_per_ehp'),
    resourceValueIsk: bigint('resource_value_isk', { mode: 'number' }),
  },
  (t) => ({
    sourceNameUnique: uniqueIndex('sites_source_tab_name_unique').on(t.sourceTab, t.name),
  }),
);

// Wave aggregates are recomputed live in queries.ts via npc-stats.
export const waves = pgTable('waves', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  waveNumber: integer('wave_number').notNull(),
  waveLabel: text('wave_label').notNull(),
});

// Per-NPC combat stats are computed live from raw EVE SDE attributes.
// `type_id` is the join key.
export const npcs = pgTable('npcs', {
  id: serial('id').primaryKey(),
  waveId: integer('wave_id').notNull().references(() => waves.id, { onDelete: 'cascade' }),
  orderInWave: integer('order_in_wave').notNull(),
  triggerLabel: text('trigger_label'),
  quantity: integer('quantity').notNull(),
  sleeperName: text('sleeper_name').notNull(),
  sleeperClassCode: text('sleeper_class_code').notNull(),
  typeId: integer('type_id').notNull(),
});

export const siteResources = pgTable('site_resources', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  orderInSite: integer('order_in_site').notNull(),
  resourceKind: text('resource_kind').notNull(),
  resourceName: text('resource_name').notNull(),
  units: bigint('units', { mode: 'number' }),
  volumeM3: bigint('volume_m3', { mode: 'number' }),
  totalIsk: bigint('total_isk', { mode: 'number' }),
  typeId: integer('type_id'),
});
```

<!-- uth:code id="code-sites-combat" file="src/features/wormhole-sites/queries.ts" lines="48-82,85-153" lang="ts" -->
```ts id="2rdvsw"
function mergeNpc(base: NpcRow, stats: CombatStats | undefined): Npc {
  const { waveId: _waveId, typeId: _typeId, ...rest } = base;
  if (!stats) {
    return {
      ...rest,
      scram: null, web: null, neut: null, rrep: null,
      sig: null, speed: null, distance: null, velocity: null,
      dps: null, alpha: null, ehp: null,
    };
  }
  return {
    ...rest,
    scram: stats.ewar.scram,
    web: stats.ewar.web !== 0 ? 1 : 0,
    neut: -stats.ewar.neutCount,
    rrep: stats.ewar.rrepCount,
    sig: stats.movement.sigRadius,
    speed: stats.movement.maxVelocity,
    distance: stats.movement.orbitDistance,
    velocity: stats.movement.orbitVelocity,
    dps: Math.round(stats.total.dps),
    alpha: Math.round(stats.total.alpha),
    ehp: Math.round(stats.hp.ehp),
  };
}

function aggregateWave(
  row: WaveRow,
  npcRows: NpcRow[],
  statsByType: Map<number, CombatStats>,
): Wave {
  const enriched: Npc[] = npcRows.map((n) => mergeNpc(n, statsByType.get(n.typeId)));
  const contributing = npcRows
    .map((n) => ({ stats: statsByType.get(n.typeId), quantity: n.quantity }))
    .filter((x): x is { stats: CombatStats; quantity: number } => x.stats !== undefined);
  const totals = summariseWave(contributing);

  return {
    id: row.id,
    waveNumber: row.waveNumber,
    waveLabel: row.waveLabel,
    dpsTotal: totals.dpsTotal,
    alphaTotal: totals.alphaTotal,
    ehpTotal: totals.ehpTotal,
    npcs: enriched,
  };
}
```

<!-- uth:code id="code-sites-catalog-query" file="src/features/wormhole-sites/queries.ts" lines="198-208,220-307,69-72" lang="ts" -->
```ts id="8h8hcx"
export async function listSiteDetails(filters: {
  type?: SiteType;
  wormholeClass?: WormholeClass;
}): Promise<SiteDetail[]> {
  // The catalogue is deploy-static. Live prices are layered on separately.
  'use cache';
  cacheLife('max');

  return withColdStartRetry(async () => {
    const allRows = await db.select(SITE_LIST_COLUMNS).from(sites);
    const siteRows = filters.wormholeClass
      ? allRows.filter((s) => matchesClass(s, filters.wormholeClass!))
      : allRows;

    const siteIds = siteRows.map((s) => s.id);
    const [waveRows, resourceRows] = await Promise.all([
      db.select({ id: waves.id, siteId: waves.siteId, waveNumber: waves.waveNumber, waveLabel: waves.waveLabel })
        .from(waves)
        .where(inArray(waves.siteId, siteIds)),
      db.select({
        id: siteResources.id,
        siteId: siteResources.siteId,
        resourceName: siteResources.resourceName,
        units: siteResources.units,
        volumeM3: siteResources.volumeM3,
        totalIsk: siteResources.totalIsk,
        typeId: siteResources.typeId,
      })
        .from(siteResources)
        .where(inArray(siteResources.siteId, siteIds)),
    ]);

    const npcRows = waveIds.length > 0
      ? await db.select({ typeId: npcs.typeId, waveId: npcs.waveId, quantity: npcs.quantity })
          .from(npcs)
          .where(inArray(npcs.waveId, waveIds))
      : [];

    const distinctTypeIds = [...new Set(npcRows.map((n) => n.typeId))];
    const statsByType = await getCombatStatsBatch(distinctTypeIds);

    return siteRows.map((site) => ({
      ...site,
      waves: wavesBySiteId.get(site.id) ?? [],
      resources: resourcesBySiteId.get(site.id) ?? [],
    }));
  });
}
```

<!-- uth:code id="code-sites-class-filter" file="src/features/wormhole-sites/queries.ts" lines="156-166,169-195" lang="ts" -->
```ts id="eg79ph"
// Class match accounts for ordinary classed sites and gas sites whose
// `wormhole_class` is NULL but whose name encodes a class range.
function matchesClass(
  s: Pick<SiteListItem, 'name' | 'siteType' | 'wormholeClass'>,
  cls: WormholeClass,
): boolean {
  if (s.wormholeClass === cls) return true;
  if (s.siteType === 'gas') {
    const range = gasClassRange(s.name);
    return range !== null && classRangeIncludes(range, cls);
  }
  return false;
}

export async function listSites(filters: {
  type?: SiteType;
  wormholeClass?: WormholeClass;
}): Promise<SiteListItem[]> {
  'use cache';
  cacheLife('max');
  const rows = await withColdStartRetry(() =>
    db.select(SITE_LIST_COLUMNS).from(sites).orderBy(sites.sourceTab, sites.name),
  );

  return filters.wormholeClass
    ? rows.filter((s) => matchesClass(s, filters.wormholeClass!))
    : rows;
}
```

<!-- uth:code id="code-sites-live-overlay" file="src/features/wormhole-sites/live-prices.ts" lines="8-26,35-64,66-77" lang="ts" -->
```ts id="okuaop"
// Overlays live Jita 5%-percentile buy values onto a list of sites.
//
// Strategy:
// - Collect every non-null typeId across all sites' resources.
// - Batch-fetch market prices and SDE volumes.
// - For each resource: liveIsk = round(units × pct5Buy).
// - effectiveIsk = liveIsk ?? totalIsk per row.
// - At the site level, resourceValueIsk is recomputed as sum(effectiveIsk).

export async function overlayLivePrices(sites: SiteDetail[]): Promise<SiteDetail[]> {
  const allTypeIds = new Set<number>();
  for (const s of sites) {
    for (const r of s.resources) {
      if (r.typeId != null) allTypeIds.add(r.typeId);
    }
  }
  if (allTypeIds.size === 0) return sites;

  const typeIdList = [...allTypeIds];
  const [prices, types] = await Promise.all([
    getPrices(typeIdList),
    getTypesByIds(typeIdList),
  ]);
  const typeById = new Map(types.map((t) => [t.id, t]));

  return sites.map((site) => {
    const newResources = site.resources.map((r) => {
      const liveEligible = isLiveEligible(r, typeById);
      const liveIsk = liveEligible
        ? liveIskFor(r.units, prices.get(r.typeId!)?.pct5Buy ?? null)
        : null;
      const effectiveIsk = liveIsk ?? r.totalIsk;
      return { ...r, liveIsk, effectiveIsk, liveEligible };
    });

    return {
      ...site,
      resources: newResources,
      resourceValueIsk: newResources.reduce((sum, r) => sum + (r.effectiveIsk ?? 0), 0),
    };
  });
}
```

<!-- uth:code id="code-sites-refresh-on-view" file="src/features/wormhole-sites/components/SiteResourcesLive.tsx" lines="19-29,40-60,62-80,83-110" lang="tsx" -->
```tsx id="6pfqds"
// Live ore/gas pricing for one site. The provider wraps the whole card so
// the card total and resource rows refresh from one engine call.

export function SiteLiveProvider({ resources, children }: {
  resources: SiteResource[];
  children: ReactNode;
}) {
  const eligibleTypeIds = useMemo(() => eligibleTypeIdsOf(resources), [resources]);
  const [enabled, setEnabled] = useState(false);
  const requestEnable = useCallback(() => setEnabled(true), []);
  const { prices, isPending } = useRefreshOnView(eligibleTypeIds, { enabled });

  const value = useMemo<SiteLiveValue>(
    () => ({ priceOf: (typeId) => prices.get(typeId), isPending, requestEnable }),
    [prices, isPending, requestEnable],
  );

  return <SiteLiveContext.Provider value={value}>{children}</SiteLiveContext.Provider>;
}

// Zero-height marker placed at the top of the collapsed-hidden body.
// Fires the first time it is opened and on screen.
function ViewSentinel() {
  const { requestEnable } = useSiteLive();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        requestEnable();
        observer.disconnect();
      }
    });
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, [requestEnable]);
  return <div ref={ref} aria-hidden className="h-0" />;
}
```

<!-- uth:code id="code-sites-lazy-detail" file="src/features/wormhole-sites/components/LazySiteDetails.tsx" lines="10-25,27-60" lang="tsx" -->
```tsx id="3b8cgd"
/**
 * Defers the large site detail body until the parent <details> is first opened.
 * The <details> element still owns open/closed state natively — this only gates
 * when the body mounts, listening to the same native `toggle` event UrlSync taps.
 *
 * The /sites/[id] detail page renders SiteDetailsBody directly server-side
 * instead, keeping that page's NPC content in the initial HTML for SEO.
 */
export function LazySiteDetails({ site, zoom = false }: { site: SiteDetail; zoom?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) return;
    const details = ref.current?.closest('details');
    if (!details) return;
    if (details.open) {
      setOpen(true);
      return;
    }
    const onToggle = () => {
      if (details.open) flushSync(() => setOpen(true));
    };
    details.addEventListener('toggle', onToggle);
    return () => details.removeEventListener('toggle', onToggle);
  }, [open]);

  return (
    <div ref={ref} className={zoom ? 'sites-detail-zoom' : 'contents'}>
      {open ? <SiteDetailsBody site={site} /> : null}
    </div>
  );
}
```

<!-- uth:code id="code-sites-page" file="src/app/sites/page.tsx" lines="36-42,44-88,99-114" lang="tsx" -->
```tsx id="d0qfbh"
// Per-request memo for the whole priced catalogue. Filtering moved client-side,
// so the server loads ALL sites once and overlays live prices in a single pass.
const loadAllSites = cache(async (): Promise<SiteDetail[]> => {
  const rawSites = await listSiteDetails({});
  return overlayLivePrices(rawSites);
});

async function SitesContent({ searchParams }: {
  searchParams: Promise<SitesSearchParams>;
}) {
  const raw = await searchParams;
  const sortKey = parseSortKey(raw.sort);
  const sortDir = parseSortDir(raw.dir);
  const initialView = readPreferenceCookieValue(
    (await cookies()).get(cookieNameFor(sitesView))?.value,
    sitesView,
  );
  const sites = await loadAllSites();

  const cards = sites.map((site) => ({
    meta: { id: site.id, type: site.siteType, clsSet: siteClassSet(site) },
    node: (
      <UrlSync key={site.id} basePath="/sites" entityId={site.id}>
        <SiteCard site={site} />
      </UrlSync>
    ),
  }));

  const table = <SitesTable sites={sites} sortKey={sortKey} sortDir={sortDir} />;

  return <SitesFilterLayout cards={cards} table={table} total={sites.length} initialView={initialView} />;
}

export default function SitesPage({ searchParams }: { searchParams: Promise<SitesSearchParams> }) {
  return (
    <PageShell>
      <Suspense fallback={<SitesLoading />}>
        <SitesContent searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
```

<!-- uth:code id="code-sites-filter-layout" file="src/features/wormhole-sites/components/SitesFilterLayout.tsx" lines="5-14,43-63,71-86,93-108,156-217" lang="tsx" -->
```tsx id="0qdr3e"
// Client filter layout for /sites. Owns Class chips + Type rows, the Cards/Table
// toggle, and the persistent rail. The priced site cards and sortable table are
// rendered server-side and handed in as nodes.

export function SitesFilterLayout({ cards, table, total, initialView }: {
  cards: SiteCardItem[];
  table: ReactNode;
  total: number;
  initialView: 'cards' | 'table';
}) {
  const [cls, setCls] = useState<WormholeClass[]>([]);
  const [types, setTypes] = useState<SiteType[]>([]);
  const [view, setView] = usePreference(sitesView, { serverValue: initialView });
  const [detailMode, setDetailMode] = usePreference(sitesDetailMode);

  useEffect(() => {
    const root = tableRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.sites-table-row').forEach((details) => {
      const rowType = details.getAttribute('data-site-type') as SiteType | null;
      const rowCls = (details.getAttribute('data-site-cls') ?? '').split(',');
      const ok = matchesFilter({ type: rowType, clsSet: rowCls }, { cls, types });
      const wrapper = details.parentElement;
      if (wrapper) wrapper.hidden = !ok;
    });
  });

  return (
    <>
      <PageHead
        crumb="sites"
        title="Wormhole Sites"
        meta={<><b>{filteredCount}</b> of {total} sites · jita <b>live</b></>}
      />
      {/* filter rail, cards/table toggle, detail-mode toggle */}
      {view === 'cards'
        ? SECTION_ORDER.map((type) => (
            <section key={type}>
              <div className="sites-grid">{sectionCards.map((c) => c.node)}</div>
            </section>
          ))
        : <div ref={tableRef}>{table}</div>}
    </>
  );
}
```

<!-- uth:code id="code-sites-ship-summary" file="src/features/wormhole-sites/npc-summary.ts, src/features/wormhole-sites/components/SiteShipClasses.tsx" lines="13-36,1-28" lang="tsx" -->
```tsx id="3z91mr"
export function summariseSiteShipClasses(site: SiteDetail): ShipClassSummary[] {
  const counts = new Map<SleeperClassCode, number>();

  for (const wave of site.waves) {
    for (const npc of wave.npcs) {
      const code = npc.sleeperClassCode;
      if (!isSleeperClassCode(code)) continue;
      counts.set(code, (counts.get(code) ?? 0) + npc.quantity);
    }
  }

  const summary: ShipClassSummary[] = [];
  for (const code of SLEEPER_CLASS_ORDER) {
    const count = counts.get(code);
    if (count) summary.push({ code, count });
  }
  return summary;
}

export function SiteShipClasses({ site }: { site: SiteDetail }) {
  const classes = summariseSiteShipClasses(site);
  if (classes.length === 0) return null;

  return (
    <div className="sites-card-ships">
      {classes.map((c) => (
        <span key={c.code} className="sites-card-ship">
          <ShipClassIcon code={c.code} size={18} />
          <span className="sites-card-ship-label">{SLEEPER_CLASS_LABEL[c.code]}</span>
          <span className="sites-card-ship-count">{c.count}</span>
        </span>
      ))}
    </div>
  );
}
```

<!-- uth:code id="code-sites-lightbox" file="src/features/wormhole-sites/components/SiteCard.tsx, src/features/wormhole-sites/components/SiteCardLightbox.tsx" lines="11-20,31-46,13-27,62-88" lang="tsx" -->
```tsx id="gvq03o"
// SiteCard owns the card chrome and collapsed summary. The expanded body lives
// in SiteDetailsBody so the table view and lightbox render identical detail.

export function SiteCard({ site, defaultOpen = false }: {
  site: SiteDetail;
  defaultOpen?: boolean;
}) {
  const liveResources = displayableResources(site.resources);

  return (
    <div className="sites-card">
      <SiteLiveProvider resources={liveResources}>
        <details data-collapsible {...(defaultOpen ? { open: true } : {})}>
          <summary className="sites-card-summary">
            <SiteCardHeader site={site} />
          </summary>
          {defaultOpen ? <SiteDetailsBody site={site} /> : <LazySiteDetails site={site} zoom />}
        </details>
        {!defaultOpen && <SiteCardLightbox site={site} />}
      </SiteLiveProvider>
    </div>
  );
}

export function SiteCardLightbox({ site }: { site: SiteDetail }) {
  const [mode] = usePreference(sitesDetailMode);
  return (
    <>
      {mode === 'lightbox' && (
        <Dialog className="sites-lightbox-dialog">
          <div className="sites-lightbox-panel">
            <div className="sites-lightbox-zoom">
              <div className="sites-card-summary">
                <SiteCardHeader site={site} />
              </div>
              <SiteDetailsBody site={site} />
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
```

<!-- uth:code id="code-sites-api" file="src/app/api/sites/route.ts, src/app/api/sites/[id]/route.ts" lines="16-43,7-24" lang="ts" -->
```ts id="brvwim"
// src/app/api/sites/route.ts
// authz: public
export async function GET(request: NextRequest): Promise<Response> {
  const parsed = sitesQuerySchema.safeParse({
    type: request.nextUrl.searchParams.get('type') ?? undefined,
    class: request.nextUrl.searchParams.get('class') ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: 'Invalid query' } satisfies ApiError, { status: 400 });
  }

  const result = await listSites({
    type: parsed.data.type,
    wormholeClass: parsed.data.class,
  });

  return Response.json(result.map(toApiShape) satisfies SiteListApiItem[]);
}

// src/app/api/sites/[id]/route.ts
// authz: public
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = siteIdParamSchema.safeParse(await params);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid id' } satisfies ApiError, { status: 400 });
  }

  const site: SiteDetail | null = await getPricedSiteDetail(parsed.data.id);
  if (!site) return Response.json({ error: 'Not found' } satisfies ApiError, { status: 404 });
  return Response.json(site satisfies SiteDetail);
}
```
<!-- uth:code-excerpts:end -->

