## Admin & Telemetry
<!-- updated: 2026-06-30 -->

Admin and telemetry started as a reporting problem, but they turned into a boundary problem.

I wanted visibility into LGI.tools without turning the site into a third-party analytics surface. The project needed enough data to answer practical questions — are people finding the site, are prices refreshing, are crons running, did an admin role change happen — without storing IP addresses, user agents, or a behavioral profile in someone else’s dashboard. That pushed the architecture toward first-party telemetry: small event rows in Neon, narrow metadata, explicit retention, and admin-only read surfaces.

[PR #14](https://github.com/StorminRH/lgi-tools/pull/14) created the first version of that layer. The `usage_logs` table stores one row per tracked action with a nullable character ID, plain-text action, and JSON metadata. Nullable character ID was deliberate. Anonymous visitors still matter for reach, but a logged-out page view should not require inventing an identity. The action column stayed `text` instead of a Postgres enum because telemetry vocabulary changes whenever a feature adds a new event. The code owns the allowed action list in TypeScript; the database stays flexible.<sup><a href="#code-admin-usage-schema">1</a></sup>

The next rule came later and was more important: not every action may come from the browser. Page views and terminal searches are client events. Cron outcomes, auth events, role changes, price-source degradation, token-refresh races, and account purges are server events. [PR #51](https://github.com/StorminRH/lgi-tools/pull/51) made that split explicit after the market-price pipeline had been failing too quietly. The public telemetry endpoint validates only the client action list, so a browser cannot forge a `cron_prices` row or fake an admin audit event. Server-only events go through `logUsageEvent` from route handlers and cron routes instead.<sup><a href="#code-admin-actions">2</a></sup><sup><a href="#code-admin-telemetry-contract">3</a></sup>

The page-view tracker is intentionally small. It mounts once in the root layout, watches the current URL, skips `/admin` and `/api`, and posts a `page_view` row through `sendBeacon` with fetch as a fallback. The metadata is useful but bounded: path, query string, external referrer host, UTM tags, a random visitor UUID stored in localStorage, and whether this was the first page view of the tab session. That visitor ID is not a fingerprint. It is a browser-local random ID so the admin dashboard can distinguish a first-time landing from another click in the same session.<sup><a href="#code-admin-layout">4</a></sup><sup><a href="#code-admin-reporter">5</a></sup><sup><a href="#code-admin-client-post">6</a></sup>

The public write route is also defensive. It validates JSON shape before any write, caps serialized metadata at 2 KB, rate-limits the caller, reads the signed-in character from the Better Auth session if there is one, and then writes fire-and-forget. Telemetry must never break a page view, login, search, or navigation. If a usage insert fails, that is a bug to log, not a reason to fail the user’s request.<sup><a href="#code-admin-public-route">7</a></sup>

The first admin report was practical: totals, daily activity, top pages, top searches, and role-change audit. It did the job, but the scope kept growing. [PR #27](https://github.com/StorminRH/lgi-tools/pull/27) added acquisition metadata from the same first-party page-view rows: referrers, UTM sources, and entry pages. [PR #51](https://github.com/StorminRH/lgi-tools/pull/51) added cron and price-degradation rows. [PR #69](https://github.com/StorminRH/lgi-tools/pull/69) turned those into a health dashboard. That was the point where telemetry stopped being just “how many visitors?” and became operational memory for the site.

The repo now treats those read paths as raw counts first and derived interpretation second. SQL queries pull counts, sums, latest runs, source splits, and JSON metadata fields. The TypeScript derivation layer turns those into ratios, buckets, status labels, and one-line summaries. That separation is there because empty windows, real zeroes, and 100-percent cases are easy to lie about accidentally. A dashboard should say “no price refreshes recorded,” not display a fake 0-percent success rate with no denominator.<sup><a href="#code-admin-telemetry-queries">8</a></sup><sup><a href="#code-admin-health-math">9</a></sup>

Google Search Console was a separate decision. [PR #73](https://github.com/StorminRH/lgi-tools/pull/73) added Search Console data to the admin SEO view, but not by adding Google Analytics. There is no Google tracking script, no Google cookie, and no visitor behavior going to a new frontend service. The app runs a backend cron with a service-account credential, pulls data Google already has about the public site’s search visibility, and stores the snapshot in its own `gsc_*` tables. Those tables are intentionally separate from `usage_logs`: Search Console is external, periodically synced data, not first-party telemetry.<sup><a href="#code-admin-gsc-schema">10</a></sup>

The GSC sync follows the same operational pattern as the price and SDE jobs. The cron is bearer-authenticated, guarded by a session advisory lock, writes a structured outcome to `usage_logs`, and degrades to the last stored snapshot when one surface fails. Search analytics, sitemap data, and URL inspection are isolated from each other; a partial failure records `partial` instead of wiping the dashboard. The same daily cron also prunes `usage_logs` after 180 days, which keeps the event table bounded without a separate scheduled job.<sup><a href="#code-admin-gsc-cron">11</a></sup><sup><a href="#code-admin-gsc-ingest">12</a></sup><sup><a href="#code-admin-retention">13</a></sup>

[PR #84](https://github.com/StorminRH/lgi-tools/pull/84) corrected the admin surface itself. The intermediate dashboard had tabs and repeated metrics. That made the page feel more organized, but it also made the mental model worse: the same underlying data appeared in more than one place. The current `/admin` page is one consolidated dashboard: headline KPIs, system health, traffic and SEO, and user engagement. Role management moved to `/admin/access`, because changing who can administer the site is a different task than watching whether the system is healthy.<sup><a href="#code-admin-dashboard">14</a></sup>

The system-health strip is the clearest expression of the current design. It reduces the price cron, SDE cron, GSC sync, and ESI price source to status rows that are anchored on “now,” not just the selected chart range. The details inside each row still respect the selected range, but the status dot answers the operational question: is this subsystem healthy right now? Section loading is guarded independently, too. If one admin data query fails, the page should show that section as unavailable instead of taking down the whole dashboard.<sup><a href="#code-admin-status-strip">15</a></sup><sup><a href="#code-admin-load-section">16</a></sup>

Admin role management has its own boundary. The access page is server-gated, builds the admin list, searches linked characters, includes the environment superadmin even when they are not marked `ADMIN` in the database, and shows the role-change audit. The form itself is plain HTML, but the route is the real defense. It checks the Better Auth admin flag server-side, refuses self-toggle, validates the target user, updates the role, and writes a `role_change` event. The UI can disable a button; the route has to enforce the rule.<sup><a href="#code-admin-access-page">17</a></sup><sup><a href="#code-admin-role-route">18</a></sup>

The lesson here is that “admin data” is not one thing. Usage telemetry, operational health, Search Console snapshots, performance telemetry, and authorization audit all answer different questions and deserve different boundaries. `usage_logs` is first-party event memory with retention. `gsc_*` tables are backend-synced external search visibility. Vercel Speed Insights is disclosed as performance telemetry and only loaded in production. Role changes are server-only audit events. Cron outcomes are operational signals. The dashboard composes those views, but the data sources do not collapse into one vague analytics bucket.

That matters for an AI-built codebase because dashboards are especially prone to shortcutting. It is easy to add “just one more metric” by reaching across layers, accepting a client-forged event, or blending external and first-party data until the privacy story is no longer true. The repo’s rule is stricter now: decide what kind of signal it is, decide who is allowed to write it, decide how long it is retained, and only then put it on the admin surface.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-admin-usage-schema" file="src/data/telemetry/schema.ts" lines="6-31" lang="ts" -->
```ts
export const usageLogs = pgTable(
  'usage_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    characterId: bigint('character_id', { mode: 'number' }).references(
      () => characters.characterId,
      { onDelete: 'set null' },
    ),
    action: text('action').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  },
  (t) => [
    index('usage_logs_timestamp_idx').on(t.timestamp.desc()),
    index('usage_logs_action_timestamp_idx').on(t.action, t.timestamp.desc()),
    index('usage_logs_character_timestamp_idx').on(t.characterId, t.timestamp.desc()),
  ],
);
```

<!-- uth:code id="code-admin-actions" file="src/data/telemetry/types.ts" lines="3-41" lang="ts" -->
```ts
export const CLIENT_USAGE_ACTIONS = ['page_view', 'terminal_search'] as const;

export const SERVER_USAGE_ACTIONS = [
  'auth_login',
  'auth_logout',
  'role_change',
  'character_switch',
  'character_unlink',
  'admin_character_unlink',
  'admin_force_logout',
  'admin_character_reassign',
  'feedback_submitted',
  'price_source_degraded',
  'cron_prices',
  'cron_industry_indices',
  'cron_sde',
  'cron_gsc',
  'cron_sync_sweeper',
  'cron_affiliations',
  'eve_token_refresh_race',
  'account_purge',
] as const;

export const USAGE_ACTIONS = [
  ...CLIENT_USAGE_ACTIONS,
  ...SERVER_USAGE_ACTIONS,
] as const;

export type UsageAction = (typeof USAGE_ACTIONS)[number];
```

<!-- uth:code id="code-admin-telemetry-contract" file="src/data/telemetry/api-contract.ts" lines="8-23" lang="ts" -->
```ts
// Validates against CLIENT_USAGE_ACTIONS, not the full set: server-only
// actions (cron health signals, auth/admin audit) must not be forgeable by a
// client POST, or the health/audit rows they write could be polluted.
export const telemetryRequestSchema = z.object({
  action: z.enum(CLIENT_USAGE_ACTIONS),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const telemetryEndpoint: ApiEndpoint<z.input<typeof telemetryRequestSchema>, undefined> = {
  method: 'POST',
  path: '/api/telemetry',
  request: telemetryRequestSchema,
  response: null,
};
```

<!-- uth:code id="code-admin-layout" file="src/app/layout.tsx" lines="125-132" lang="tsx" -->
```tsx
<Suspense fallback={null}>
  <TelemetryReporter />
</Suspense>
{/* Only on Vercel (prod/preview), where the script is served same-origin. */}
{process.env.NODE_ENV === "production" && <SpeedInsights />}
```

<!-- uth:code id="code-admin-reporter" file="src/components/telemetry/TelemetryReporter.tsx" lines="9-18,54-83,86-114" lang="tsx" -->
```tsx
const SKIP_PREFIXES = ['/admin', '/api/'];
const VISITOR_KEY = 'lgi:visitor_id';
const SESSION_FLAG_KEY = 'lgi:session_started';

function shouldSkip(path: string): boolean {
  return SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function getOrCreateVisitorId(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

function takeIsEntry(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const flagged = window.sessionStorage.getItem(SESSION_FLAG_KEY);
    if (flagged) return false;
    window.sessionStorage.setItem(SESSION_FLAG_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function TelemetryReporter(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!pathname || shouldSkip(pathname)) return;
    const metadata: Record<string, unknown> = { path: pathname, search };
    const referrer = readReferrerHost();
    if (referrer) metadata.referrer = referrer;
    const utm = readUtmTags(searchParams);
    if (utm) metadata.utm = utm;
    const visitorId = getOrCreateVisitorId();
    if (visitorId) metadata.visitor_id = visitorId;
    metadata.is_entry = takeIsEntry();
    postTelemetry({ action: 'page_view', metadata });
  }, [pathname, search, searchParams]);

  return null;
}
```

<!-- uth:code id="code-admin-client-post" file="src/components/telemetry/client.ts" lines="3-25" lang="ts" -->
```ts
export function postTelemetry({ action, metadata }: PostInput): void {
  const payload = { action, metadata: metadata ?? {} };

  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const ok = navigator.sendBeacon(telemetryEndpoint.path, blob);
    if (ok) return;
  }

  void apiFetch(telemetryEndpoint, { body: payload, keepalive: true }).catch(() => {});
}
```

<!-- uth:code id="code-admin-public-route" file="src/app/api/telemetry/route.ts" lines="10-22,32-53,64-79" lang="ts" -->
```ts
const MAX_METADATA_BYTES = 2048;

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = telemetryRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid body';
    return new Response(detail, { status: 400 });
  }

  const safeMetadata = parsed.data.metadata ?? {};
  if (parsed.data.metadata !== undefined) {
    const serialised = JSON.stringify(safeMetadata);
    if (new TextEncoder().encode(serialised).length > MAX_METADATA_BYTES) {
      return new Response('metadata too large', { status: 400 });
    }
  }

  const limit = await rateLimit(clientIdentifier(request.headers), {
    name: 'telemetry',
    perMinute: TELEMETRY_LIMIT_PER_MINUTE,
  });
  if (!limit.ok) return Response.json({ error: 'rate_limited', retryAfter: limit.retryAfter }, { status: 429 });

  void getSessionCharacterId()
    .then((characterId) =>
      logUsageEvent({ action: parsed.data.action, characterId, metadata: safeMetadata }),
    )
    .catch((err) => console.error('[telemetry] failed to record usage event', err));

  return new Response(null, { status: 204 });
}
```

<!-- uth:code id="code-admin-telemetry-queries" file="src/data/telemetry/queries.ts" lines="42-60,89-164,221-255,77-97" lang="ts" -->
```ts
export async function logUsageEvent(input: LogEventInput): Promise<void> {
  await db.insert(usageLogs).values({
    action: input.action,
    characterId: input.characterId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function pruneUsageLogs(retentionDays: number, now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await db.delete(usageLogs).where(lt(usageLogs.timestamp, cutoff));
}

function topByMetadataKeyQuery(metaKey: string, action: UsageAction, range: DateRange, limit: number) {
  const col = sql<string>`${usageLogs.metadata} ->> ${metaKey}`;
  return db
    .select({ value: col, count: count() })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, action), isNotNull(col)))
    .groupBy(sql`1`)
    .orderBy(desc(count()))
    .limit(limit);
}

export async function getFallbackRate(range: DateRange): Promise<FallbackRateData> {
  const esi = sql<number>`coalesce(sum(${jsonInt('esiCount')}), 0)`.mapWith(Number);
  const fallback = sql<number>`coalesce(sum(${jsonInt('fuzzworkFallbackCount')}), 0)`.mapWith(Number);
  // returns totals plus per-day split for the dashboard trend
}

export async function getLastCronRuns(): Promise<CronLastRun[]> {
  const outcome = sql<string | null>`${usageLogs.metadata} ->> 'outcome'`;
  const rows = await db
    .selectDistinctOn([usageLogs.action], { action: usageLogs.action, timestamp: usageLogs.timestamp, outcome })
    .from(usageLogs)
    .where(inArray(usageLogs.action, ['cron_prices', 'cron_sde', 'cron_gsc']))
    .orderBy(usageLogs.action, desc(usageLogs.timestamp));
  return rows.map((r) => ({ action: r.action as UsageAction, timestamp: r.timestamp, outcome: r.outcome }));
}
```

<!-- uth:code id="code-admin-health-math" file="src/data/telemetry/health-metrics.ts" lines="49-88,90-183,196-248" lang="ts" -->
```ts
export function ratio(num: number, denom: number): number | null {
  return denom === 0 ? null : num / denom;
}

export function fallbackSummary({ esi, fallback }: FallbackRateData): string {
  const denom = esi + fallback;
  if (denom === 0) return 'No price refreshes recorded this period.';
  if (fallback === 0) return 'ESI served every priced item this period.';
  const pct = Math.round((fallback / denom) * 100);
  return `Fuzzwork covered ${pct}% of priced items when ESI was unavailable.`;
}

export function deriveCronStatus(input: CronStatusInput): SubsystemStatus {
  const { lastRun, outcomes, expectedEveryHours, now } = input;
  if (!lastRun) return { level: 'red', headline: 'never ran' };
  const ageHours = (now.getTime() - lastRun.timestamp.getTime()) / 3_600_000;
  const lastKind = classifyOutcome(lastRun.outcome, input);
  if (lastKind === 'unhealthy') return { level: 'red', headline: `failing · ${lastRun.outcome ?? 'unknown outcome'}` };
  if (ageHours > expectedEveryHours * STALE_RED_FACTOR) return { level: 'red', headline: 'stale' };
  if (lastKind === 'degraded') return { level: 'amber', headline: `degraded · ${lastRun.outcome}` };
  if (ageHours > expectedEveryHours * STALE_AMBER_FACTOR) return { level: 'amber', headline: 'late' };
  const failures = outcomes.filter((o) => classifyOutcome(o.outcome, input) === 'unhealthy').reduce((s, o) => s + o.count, 0);
  if (failures > 0) return { level: 'amber', headline: `recovered · ${failures} failed runs this period` };
  return { level: 'green', headline: 'healthy' };
}

export function deriveEsiSourceStatus({ fallback, budgetExhaustions }: EsiSourceStatusInput): SubsystemStatus {
  const denom = fallback.esi + fallback.fallback;
  if (denom === 0) return { level: 'neutral', headline: 'no price refreshes this period' };
  const rate = fallback.fallback / denom;
  if (rate > FALLBACK_RED_RATE) return { level: 'red', headline: 'degraded' };
  if (fallback.fallback > 0 || budgetExhaustions > 0) return { level: 'amber', headline: 'partial' };
  return { level: 'green', headline: 'ESI served every priced item this period' };
}
```

<!-- uth:code id="code-admin-gsc-schema" file="src/data/gsc/schema.ts" lines="16-29,30-45,47-78" lang="ts" -->
```ts
export const gscSearchAnalytics = pgTable(
  'gsc_search_analytics',
  {
    date: date('date').notNull(),
    dimension: text('dimension').notNull(),
    key: text('key').notNull(),
    clicks: integer('clicks').notNull(),
    impressions: integer('impressions').notNull(),
    position: doublePrecision('position').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.dimension, t.key] }),
    index('gsc_search_analytics_dimension_date_idx').on(t.dimension, t.date),
  ],
);

export const gscSitemaps = pgTable('gsc_sitemaps', {
  path: text('path').primaryKey(),
  warnings: bigint('warnings', { mode: 'number' }).notNull().default(0),
  errors: bigint('errors', { mode: 'number' }).notNull().default(0),
  submitted: bigint('submitted', { mode: 'number' }).notNull().default(0),
  indexed: bigint('indexed', { mode: 'number' }).notNull().default(0),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
});

export const gscUrlInspection = pgTable('gsc_url_inspection', {
  url: text('url').primaryKey(),
  verdict: text('verdict'),
  coverageState: text('coverage_state'),
  robotsTxtState: text('robots_txt_state'),
  indexingState: text('indexing_state'),
  pageFetchState: text('page_fetch_state'),
  lastCrawlTime: timestamp('last_crawl_time', { withTimezone: true }),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
});
```

<!-- uth:code id="code-admin-gsc-cron" file="src/app/api/cron/refresh-gsc/route.ts" lines="16-27,32-64,66-101,104-116" lang="ts" -->
```ts
export async function GET(req: Request): Promise<Response> {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const start = Date.now();
  const reserved = await directClient.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      await swallow('[cron:gsc] telemetry write failed', logUsageEvent({ action: 'cron_gsc', metadata: { outcome: 'skipped', reason: 'busy' } }));
      return Response.json({ status: 'skipped', reason: 'busy', durationMs: Date.now() - start });
    }
    lockHeld = true;

    const summary = await syncGsc(directClient);
    await swallow('[cron:gsc] usage_logs prune failed', pruneUsageLogs(USAGE_LOG_RETENTION_DAYS));
    await swallow('[cron:gsc] telemetry write failed', logUsageEvent({
      action: 'cron_gsc',
      metadata: { outcome: summary.status, reason: summary.reason, errorCount: summary.errors.length, durationMs: summary.durationMs },
    }));
    return Response.json(summary);
  } finally {
    try {
      if (lockHeld) await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    } finally {
      reserved.release();
    }
  }
}
```

<!-- uth:code id="code-admin-gsc-ingest" file="src/data/gsc/ingest.ts" lines="165-190,221-255,258-305" lang="ts" -->
```ts
async function syncSearchAnalytics(db: AnyPgDb, startDate: string, endDate: string, syncedAt: Date): Promise<SurfaceResult> {
  try {
    const perPull = await Promise.all(
      SEARCH_PULLS.map(async (pull) =>
        searchRowsToRecords(
          await querySearchAnalytics({ startDate, endDate, dimensions: pull.apiDimensions }),
          pull.storage,
          syncedAt,
        ),
      ),
    );
    const records = perPull.flat();
    await upsertSearchAnalytics(db, records);
    return { count: records.length, error: null };
  } catch (err) {
    return { count: 0, error: `search-analytics: ${errText(err)}` };
  }
}

async function syncUrlInspections(db: AnyPgDb, syncedAt: Date): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];
  for (const url of inspectionUrls()) {
    try {
      const status = await inspectUrl(url);
      if (!status) continue;
      await db.insert(gscUrlInspection).values(indexStatusToRecord(url, status, syncedAt)).onConflictDoUpdate({ target: gscUrlInspection.url, set: { syncedAt: excluded('synced_at') } });
      count++;
    } catch (err) {
      errors.push(`url-inspection ${url}: ${errText(err)}`);
    }
  }
  return { count, errors };
}

export async function syncGsc(client: Sql): Promise<GscSyncSummary> {
  if (!isGscConfigured()) return { status: 'skipped', reason: 'not_configured', searchRows: 0, sitemaps: 0, urlsInspected: 0, errors: [], durationMs: 0 };
  const search = await syncSearchAnalytics(db, startDate, endDate, syncedAt);
  const sitemap = await syncSitemaps(db, syncedAt);
  const urls = await syncUrlInspections(db, syncedAt);
  const errors = [search.error, sitemap.error, ...urls.errors].filter((e): e is string => e !== null);
  const anyLanded = search.count + sitemap.count + urls.count > 0;
  const status = errors.length === 0 ? 'synced' : anyLanded ? 'partial' : 'failed';
  return { status, reason: status === 'failed' ? errors[0] : undefined, searchRows: search.count, sitemaps: sitemap.count, urlsInspected: urls.count, errors, durationMs: Date.now() - start };
}
```

<!-- uth:code id="code-admin-retention" file="src/data/telemetry/constants.ts" lines="10-15" lang="ts" -->
```ts
export const USAGE_LOG_RETENTION_DAYS = 180;
```

<!-- uth:code id="code-admin-dashboard" file="src/app/admin/page.tsx" lines="18-22,64-76,83-124,137-153" lang="tsx" -->
```tsx
async function AdminContent({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const session = await getSession();
  if (!isAdmin(session)) {
    redirect('/?auth_error=admin_required');
  }

  const raw = await searchParams;
  const rangeKey = parseRange(raw.range);
  const range = rangeFor(rangeKey);

  return (
    <>
      <PageHead
        crumb="admin"
        title="Admin"
        subtitle={`${formatDate(range.from)} → ${formatDate(range.to)}`}
        meta={<><RangeSelector range={rangeKey} /><Link href="/admin/access">Access →</Link><PrintButton /></>}
      />
      <Suspense fallback={<SectionFallback />}><KpiRow rangeKey={rangeKey} range={range} /></Suspense>
      <Suspense fallback={<SectionFallback />}><StatusStrip range={range} /></Suspense>
      <Suspense fallback={<SectionFallback />}><TrafficSection range={range} /></Suspense>
      <Suspense fallback={<SectionFallback />}><UsersSection range={range} /></Suspense>
    </>
  );
}

export default function AdminPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  return <PageShell><Suspense fallback={<AdminLoading />}><AdminContent searchParams={searchParams} /></Suspense></PageShell>;
}
```

<!-- uth:code id="code-admin-status-strip" file="src/app/admin/StatusStrip.tsx" lines="81-148,156-178,201-252" lang="tsx" -->
```tsx
export async function StatusStrip({ range }: { range: DateRange }) {
  const gscConfigured = isGscConfigured();
  const fetched = await loadSection('system-health', () =>
    Promise.all([
      getLastCronRuns(),
      getPriceCronOutcomes(range),
      getSdeCronOutcomes(range),
      getGscCronOutcomes(range),
      getFallbackRate(range),
      getBudgetExhaustionCount(range),
      getDegradationByCaller(range),
      getRefreshVolume(range),
      gscConfigured ? getLastSyncedAtShared() : Promise.resolve(null),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="System health" />;

  const priceStatus = deriveCronStatus({ lastRun: lastFor('cron_prices'), outcomes: priceOutcomes, healthy: PRICES_HEALTHY_OUTCOMES, expectedEveryHours: 24, now });
  const sdeStatus = deriveCronStatus({ lastRun: lastFor('cron_sde'), outcomes: sdeOutcomes, healthy: SDE_HEALTHY_OUTCOMES, neutral: SDE_NEUTRAL_OUTCOMES, expectedEveryHours: 24, now });
  const gscStatus = deriveGscStatus({ configured: gscConfigured, lastRun: lastFor('cron_gsc'), outcomes: gscOutcomes, lastSyncedAt, now });
  const esiStatus = deriveEsiSourceStatus({ fallback, budgetExhaustions });

  return (
    <Card>
      <StatusRow name="Price cron" status={priceStatus}>{/* details */}</StatusRow>
      <StatusRow name="SDE cron" status={sdeStatus}>{/* details */}</StatusRow>
      <StatusRow name="GSC sync" status={gscStatus}>{/* details */}</StatusRow>
      <StatusRow name="ESI source" status={esiStatus}>{/* details */}</StatusRow>
    </Card>
  );
}
```

<!-- uth:code id="code-admin-load-section" file="src/app/admin/load-section.ts" lines="5-34" lang="ts" -->
```ts
export const SECTION_LOAD_FAILED = Symbol('admin.section-load-failed');

export async function loadSection<T>(
  label: string,
  load: () => Promise<T>,
): Promise<T | typeof SECTION_LOAD_FAILED> {
  try {
    return await load();
  } catch (err) {
    unstable_rethrow(err);
    console.error(`[admin] ${label} section unavailable`, err);
    return SECTION_LOAD_FAILED;
  }
}
```

<!-- uth:code id="code-admin-access-page" file="src/app/admin/access/page.tsx" lines="48-69,192-213,223-260" lang="tsx" -->
```tsx
async function buildAdminList(): Promise<Array<{ user: AdminUser; isSuperadmin: boolean }>> {
  const dbAdmins = await listAdminUsers();
  const superId = Number(readEnv('SUPERADMIN_CHARACTER_ID'));
  const superUser = Number.isFinite(superId) && superId > 0 ? await getUserByCharacterId(superId) : null;
  const superUserId = superUser?.userId ?? null;
  const rows = dbAdmins.map(u => ({ user: u, isSuperadmin: u.userId === superUserId }));
  if (superUser && !dbAdmins.some(a => a.userId === superUserId)) {
    rows.unshift({ user: superUser, isSuperadmin: true });
  }
  return rows;
}

async function AccessContent({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) redirect('/?auth_error=admin_required');
  const viewerUserId = session.user.id;
  const raw = await searchParams;
  const query = sanitiseQuery(raw.q);
  const [adminRows, searchResults, audit] = await Promise.all([
    buildAdminList(),
    query ? searchUsersByLinkedCharacterName(query) : Promise.resolve([] as AdminUser[]),
    getRoleChangeAudit(lastNDaysRange(AUDIT_WINDOW_DAYS), 50),
  ]);
  return <PageHead crumb="access" title="Access" />;
}
```

<!-- uth:code id="code-admin-role-route" file="src/app/api/admin/role/route.ts" lines="26-82" lang="ts" -->
```ts
export async function POST(request: NextRequest): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) return new Response('Forbidden', { status: 403 });
  const viewerUserId = session.user.id;
  const actorCharacterId = session.characterId;

  const form = await request.formData();
  const parsed = adminRoleFormSchema.safeParse({
    userId: form.get('userId'),
    nextRole: form.get('nextRole'),
    q: form.get('q') ?? undefined,
  });
  if (!parsed.success) return new Response('Invalid form', { status: 400 });

  const { userId, nextRole } = parsed.data;
  if (userId === viewerUserId) return new Response('Cannot toggle your own role', { status: 400 });
  const target = await getUserById(userId);
  if (!target) return new Response('User not found', { status: 404 });

  const previousRole = target.role;
  await setUserRole(userId, nextRole);
  void logUsageEvent({
    action: 'role_change',
    characterId: actorCharacterId,
    metadata: { actorUserId: viewerUserId, targetUserId: userId, targetCharacterId: target.characterId, from: previousRole, to: nextRole },
  }).catch((err) => console.error('[admin/role] telemetry write failed', err));

  return Response.redirect(buildRedirect(request, sanitiseQuery(parsed.data.q)), 303);
}
```
<!-- uth:code-excerpts:end -->
