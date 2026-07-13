## Live Trackers
<!-- updated: 2026-06-30 -->

The live tracker work is where I had to unlearn one of my early assumptions.

At first, it felt natural to put anything that changed on screen into the live backend. Skill queues count down. Industry jobs progress. Jobs flip from active to ready. Character portraits can show online or offline. All of that feels live to the user, so the first instinct was to make it live in the infrastructure too.

That turned out to be too broad.

The better distinction is this: **live on screen** is not the same thing as **needs a live server loop**. A countdown can be live because the browser has a timestamp. A job can become ready because `end_date` passed. A skill can show progress because the queue entry carries start and finish times. None of those require the server to keep polling while the user watches. Online status is different. It is a small, genuinely live signal that changes outside the page and is useful across many surfaces at once.

That distinction is the current architecture.<sup><a href="#code-live-sync-registry">1</a></sup>

[PR #90](https://github.com/StorminRH/lgi-tools/pull/90) introduced Convex as the live backend, but it started correctly: identity and plumbing only. Convex could validate the site’s JWT, the browser could connect over the websocket, and the app could run without Convex configured. It was not allowed to become a second database for EVE domain data. That boundary mattered later because the first real trackers were tempting. Once a live backend exists, AI-generated code will naturally keep putting live-looking things there unless the repo says no.<sup><a href="#code-live-convex-schema">2</a></sup>

[PR #94](https://github.com/StorminRH/lgi-tools/pull/94) put skill queues on that foundation. [PR #96](https://github.com/StorminRH/lgi-tools/pull/96) did the same for industry jobs. Those were good proofs of the full chain: signed-in user, linked characters enumerated server-side, short-lived per-character token, authenticated ESI read, held ETags, one batched write, and reactive browser updates. They also had the right authority model. The client could request “sync my view,” but it could not post a character ID and grant itself access. The action re-enumerated the user’s linked characters from Neon every run.

The mistake was not security. The mistake was placement.

[PR #97](https://github.com/StorminRH/lgi-tools/pull/97) made the live engine smarter instead of merely more active. The engine became presence-gated: while a tracker page is open in a visible tab, a heartbeat keeps the subject warm; when the tab is hidden or gone, the subject goes cold. A static Convex cron scans due subjects, skips cold ones, and dispatches work through a bounded Workpool with per-token-group smoothing. That was a good rail. It made cost scale with watched subjects instead of total users.<sup><a href="#code-live-heartbeat">3</a></sup><sup><a href="#code-live-convex-engine">4</a></sup>

Then the scaling audits forced a sharper question: should these boards be in that engine at all?

Skills and jobs are slow data. EVE caches them. The page can compute progress locally. A finished job can flip to ready from its own timestamp. Holding a reactive connection open does not make that data meaningfully fresher; it just adds a live-data cost model to something that is mostly a stale-gated read. The hardening PRs made that visible. [PR #103](https://github.com/StorminRH/lgi-tools/pull/103) split heartbeat presence away from heavy payload reads. [PR #169](https://github.com/StorminRH/lgi-tools/pull/169) split heavy payload subscriptions from small run-state subscriptions so unchanged refreshes stopped re-sending full boards. [PR #170](https://github.com/StorminRH/lgi-tools/pull/170) capped due-subject reads so a large backlog could not hit Convex’s per-mutation ceiling. Those were all useful improvements, but they also made the smell clearer: a lot of machinery was being spent to keep slow cached boards in a live store.

[PR #174](https://github.com/StorminRH/lgi-tools/pull/174) added the permanent live consumer the engine actually needed: online status. It is small, per-character, useful anywhere a portrait appears, and tied to a short upstream cache. The provider subscribes once to Convex and shares a character-id-to-online map through context. Every portrait reads the same map, so the nav, roster, character page, and tracker cards do not each create their own subscription. The heartbeat hints the active character, but the sync action re-enumerates the full linked roster server-side.<sup><a href="#code-live-online-provider">5</a></sup><sup><a href="#code-live-portrait">6</a></sup>

Online status also has the right write discipline for Convex. The `characterOnline` row carries only the online boolean and held ETag. It does not carry per-cycle bookkeeping like `lastSyncedAt` or `expiresAt`; that belongs on the subject row. A `304` writes nothing. An errored read writes nothing. A fresh body patches the row only when `online` or `etag` actually changes. That means the reactive query wakes up when the visible state changes, not merely because a background cycle happened.<sup><a href="#code-live-online-apply">7</a></sup><sup><a href="#code-live-online-sync">14</a></sup>

[PR #175](https://github.com/StorminRH/lgi-tools/pull/175) is the correction. Skill queues, personal industry jobs, and corporation industry jobs moved out of Convex and into Neon. They now load from the database when the page opens and refresh behind the response through stale-gated write-behind. The user-facing behavior stayed live where it mattered: progress bars keep moving, countdowns keep ticking, and jobs become ready when their end time passes. But that liveness is derived in the browser from stored timestamps instead of pushed by a live scheduler.<sup><a href="#code-live-skills-schema">8</a></sup><sup><a href="#code-live-industry-jobs-schema">9</a></sup>

The on-view reads now use the same pattern as the planner’s owned-data overlays. Read the cached rows immediately. Resolve names from the SDE where needed. Start a refresh after the response. Inside the refresh, check staleness before vending a token. A re-open inside the cache window does zero ESI work. A `304` stamps freshness without rewriting the payload. A fresh response replaces the cached board.<sup><a href="#code-live-skills-on-view">10</a></sup><sup><a href="#code-live-jobs-on-view">11</a></sup>

[PR #177](https://github.com/StorminRH/lgi-tools/pull/177) cleaned up the duplication created by that migration. Skills, jobs, owned assets, owned blueprints, and corporation reads had all grown versions of the same dance: enumerate owners, check whether the stored copy is stale, vend a token, resolve a corporation role-holder when needed, make an authenticated conditional ESI read, and write the result back. The shared owner-sync engine now owns that mechanical flow. Each feature supplies a descriptor: its owner axes, eligibility rule, endpoint read, persist plan, and save/stamp functions. The engine lives in `src/lib`, so it cannot import feature code; the feature builds the descriptor and passes it in. That is exactly the boundary I want for AI-directed work: shared mechanism in one place, domain decisions still owned by the slice.<sup><a href="#code-live-owner-sync-types">12</a></sup><sup><a href="#code-live-owner-sync-engine">13</a></sup>

[PR #176](https://github.com/StorminRH/lgi-tools/pull/176) then removed the dormant Convex tables and narrowed the live engine’s dataset registry to one active consumer: `onlineStatus`. That is the final shape. Convex still matters, but it is no longer the default home for anything that animates. It is the home for small, truly live projections. Neon is the home for slow per-owner ESI mirrors. The browser is allowed to derive time-based movement from timestamps. The ESI gate remains the outbound budget boundary for both paths.

The lesson is a placement rule, not a technology preference. Use the live backend when the source is genuinely live, the payload is small, and many UI surfaces benefit from the same reactive signal. Use Neon plus stale-gated on-view refresh when the source is cached, regenerable, and mostly read by one page. Use the browser when “live” just means time passing.

That rule only exists because I got it wrong first. The early live trackers were useful because they proved the auth, token, ESI, and reactive path. The later migration was useful because it admitted that the proof had become too expensive for the slow boards. The architecture is better now because the repo can say where a tracker belongs before AI starts building it.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-live-sync-registry" file="src/lib/sync-engine.ts" lines="16-30,32-50,52-70,126-161" lang="ts" -->
```ts
// The datasets registered with the engine — one entry per live consumer.
// Adding a future consumer is a config change here plus a syncRef in
// convex/engine.ts, not new machinery.
//
// The engine serves a SINGLE live consumer: onlineStatus, the ≤2-min canary
// that keeps it exercised + proven for the v4.0 mapper. The three slow trackers
// moved to Neon stale-gated on-view reads.
export const SYNC_DATASETS = ['onlineStatus'] as const;
export type SyncDataset = (typeof SYNC_DATASETS)[number];

export const SYNC_DATASET_CONFIG: Record<
  SyncDataset,
  { cadenceFloorMs: number; tokenGroup: string }
> = {
  onlineStatus: { cadenceFloorMs: 60_000, tokenGroup: 'char-online' },
};

export const HEARTBEAT_MS = 20_000;
export const COLD_AFTER_MS = 60_000;
export const RETENTION_MS = 7 * 24 * 60 * 60_000;
export const STALE_RUNNING_MS = 3 * 60_000;

export function computeNextDueAt(
  minExpiresAt: number | null,
  cadenceFloorMs: number,
  now: number,
  random: () => number = Math.random,
): number {
  const due = Math.max(minExpiresAt ?? 0, now + cadenceFloorMs);
  return due + Math.floor(random() * SYNC_JITTER_MS);
}

export function minCacheWindow(windows: Array<number | null>): number | null {
  if (windows.length === 0 || windows.some((w) => w === null)) return null;
  return Math.min(...(windows as number[]));
}
```

<!-- uth:code id="code-live-convex-schema" file="convex/schema.ts" lines="6-17,19-57,59-108" lang="ts" -->
```ts
// Convex is a regenerable projection of live ESI data keyed by the Neon
// identities (userId + characterId) — never the system of record, never a
// home for SDE/domain data.
//
// Since MIGRATE.B the engine serves a SINGLE live consumer — onlineStatus.
// The three slow trackers moved to Neon stale-gated on-view reads.

export default defineSchema({
  syncSubjects: defineTable({
    dataset: v.literal('onlineStatus'),
    userId: v.string(),
    status: v.union(v.literal('idle'), v.literal('running')),
    lastRequestedAt: v.number(),
    workId: v.union(v.string(), v.null()),
    nextDueAt: v.union(v.number(), v.null()),
    minExpiresAt: v.union(v.number(), v.null()),
    syncedCharacterIds: v.array(v.number()),
    lastFinishedAt: v.union(v.number(), v.null()),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
  })
    .index('by_user_dataset', ['userId', 'dataset'])
    .index('by_next_due', ['nextDueAt']),

  syncPresence: defineTable({
    dataset: v.literal('onlineStatus'),
    userId: v.string(),
    lastSeenAt: v.number(),
  })
    .index('by_user_dataset', ['userId', 'dataset'])
    .index('by_last_seen', ['lastSeenAt']),

  characterOnline: defineTable({
    userId: v.string(),
    characterId: v.number(),
    online: v.boolean(),
    etag: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),
});
```

<!-- uth:code id="code-live-heartbeat" file="src/data/convex/use-sync-subject.ts" lines="5-17,23-54" lang="ts" -->
```ts
// The client half of the presence-gated sync engine: a visibility-gated heartbeat.
// While the tab is visible, beat every HEARTBEAT_MS; on hide, stop; on return,
// beat immediately so a stale view refreshes at once.

export function useSyncSubject(dataset: SyncDataset, characterIds: number[]) {
  const heartbeat = useMutation(api.engine.heartbeat);
  const characterIdsKey = characterIds.join(',');

  useEffect(() => {
    if (characterIdsKey === '') return;
    const characterIdsHint = characterIdsKey.split(',').map(Number);
    const beat = (reason: 'mount' | 'visible' | 'interval') =>
      void heartbeat({ dataset, characterIdsHint, reason });

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = (reason: 'mount' | 'visible') => {
      beat(reason);
      timer = setInterval(() => beat('interval'), HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };

    if (document.visibilityState === 'visible') start('mount');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [dataset, characterIdsKey, heartbeat]);
}
```

<!-- uth:code id="code-live-convex-engine" file="convex/engine.ts" lines="3-18,26-35,84-112,121-132,154-235,238-285" lang="ts" -->
```ts
// THE presence-gated sync engine — the one sanctioned presence/scheduling
// machinery. A subject (dataset × user) is refreshed on its dataset's cadence
// only while some visible tab is heartbeating it; cost scales with concurrently
// watched subjects, never with total linked characters.

const pool = new Workpool(components.workpool, { maxParallelism: 4 });

const rateLimiter = new RateLimiter(components.rateLimiter, {
  syncDispatch: { kind: 'token bucket', period: MINUTE, rate: 30, capacity: 10 },
});

const syncDatasetValidator = v.literal('onlineStatus');

const SYNC_REFS = {
  onlineStatus: internal.onlineStatusSync.syncUser,
} satisfies Record<SyncDataset, unknown>;

export const SCAN_DISPATCH_BATCH = 1024;

export const heartbeat = mutation({
  args: {
    dataset: syncDatasetValidator,
    characterIdsHint: v.array(v.number()),
    reason: v.union(v.literal('mount'), v.literal('visible'), v.literal('interval')),
  },
  handler: async (ctx, { dataset, characterIdsHint, reason }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return;
    const userId = identity.subject;
    const now = Date.now();

    const presence = await getPresence(ctx.db, dataset, userId);
    if (presence === null) {
      await ctx.db.insert('syncPresence', { dataset, userId, lastSeenAt: now });
    } else {
      await ctx.db.patch(presence._id, { lastSeenAt: now });
    }

    if (reason === 'interval') return;

    let subject = await getSyncSubject(ctx.db, dataset, userId);
    if (subject === null) {
      const id = await ctx.db.insert('syncSubjects', {
        dataset,
        userId,
        status: 'idle',
        lastRequestedAt: 0,
        workId: null,
        nextDueAt: null,
        minExpiresAt: null,
        syncedCharacterIds: [],
        lastFinishedAt: null,
        lastError: null,
        rlGroup: null,
        rlLimit: null,
        rlRemaining: null,
        rlUsed: null,
      });
      subject = await ctx.db.get(id);
      if (subject === null) return;
    }

    if (!hasSyncTarget(subject.syncedCharacterIds, characterIdsHint)) return;
    if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) return;
    if (!isStaleForImmediate(subject.minExpiresAt, subject.syncedCharacterIds, characterIdsHint, now)) {
      return;
    }
    await dispatch(ctx, subject, now);
  },
});

export const scan = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await dueSubjects(ctx, now);
    for (const subject of due) {
      const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
      if (isColdFromPresence(presence?.lastSeenAt ?? null, now)) {
        await ctx.db.patch(subject._id, { nextDueAt: null });
        continue;
      }
      if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) continue;
      await dispatch(ctx, subject, now);
    }
    if (due.length === SCAN_DISPATCH_BATCH) {
      logBatchCapped('engine:scan', 'scan_batch_capped', due.length);
    }
  },
});
```

<!-- uth:code id="code-live-online-provider" file="src/components/OnlineStatusProvider.tsx" lines="5-14,35-66" lang="tsx" -->
```tsx
// Mounted once in the root layout: one subscription feeds every CharacterPortrait.
// The heartbeat hints only the active character; the sync action re-enumerates
// every linked character server-side.

export function OnlineStatusProvider({ children }: { children: ReactNode }) {
  if (convexClient === null) return <>{children}</>;
  return <OnlineStatusSubscribed>{children}</OnlineStatusSubscribed>;
}

function OnlineStatusSubscribed({ children }: { children: ReactNode }) {
  const view = useQuery(api.onlineStatus.forViewer);
  const map = useMemo(() => {
    const next = new Map<number, boolean>();
    for (const c of view?.characters ?? []) next.set(c.characterId, c.online);
    return next;
  }, [view]);

  return (
    <OnlineStatusContext.Provider value={map}>
      <Authenticated>
        <OnlineStatusHeartbeat />
      </Authenticated>
      {children}
    </OnlineStatusContext.Provider>
  );
}

function OnlineStatusHeartbeat() {
  const { session } = useAuth();
  useSyncSubject('onlineStatus', session ? [session.characterId] : []);
  return null;
}
```

<!-- uth:code id="code-live-portrait" file="src/components/character-portrait.tsx" lines="5-15,35-60,62-84" lang="tsx" -->
```tsx
// The one character portrait used everywhere — a round avatar with a live online
// dot. The dot is read from OnlineStatusProvider by characterId and lights only
// for the viewer's own characters.

export function CharacterPortrait({
  characterId,
  name,
  size,
  src,
  className,
  loading = 'lazy',
}: {
  characterId?: number;
  name: string;
  size: PortraitSize;
  src?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}) {
  const online = deriveOnlineState(useOnlineFlag(characterId ?? -1));
  const imageSrc = src ?? (characterId !== undefined ? characterPortraitUrl(characterId, 128) : '');

  return (
    <span className={cn('relative inline-block shrink-0', SIZE_CLASS[size], className)}>
      <img src={imageSrc} alt={name} width={size} height={size} className="size-full rounded-full border border-border-idle object-cover" />
      {online !== 'unknown' && (
        <StatusDot state={online} className="absolute top-[7%] right-[7%] translate-x-[2px] -translate-y-[2px]" />
      )}
    </span>
  );
}
```

<!-- uth:code id="code-live-online-apply" file="convex/onlineStatus.ts" lines="23-44,75-120,125-155" lang="ts" -->
```ts
// The viewer wire reads only characterOnline, so it re-fires only when that table
// changes — not on per-cycle dispatch/completion writes.

export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('characterOnline')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      characters: docs.map((doc) => ({ characterId: doc.characterId, online: doc.online })),
    };
  },
});

export const applySyncResults = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    enumeratedCharacterIds: v.array(v.number()),
    results: v.array(characterResultValidator),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const subject = await getSyncSubject(ctx.db, 'onlineStatus', args.userId);
    if (subject === null || subject.lastRequestedAt !== args.generation) return;

    const docs = await ctx.db.query('characterOnline').withIndex('by_user', (q) => q.eq('userId', args.userId)).collect();
    const byCharacter = new Map(docs.map((doc) => [doc.characterId, doc]));

    for (const result of args.results) {
      const window = await applyOnlineResult(ctx, args.userId, result, byCharacter.get(result.characterId));
      windowsByCharacter.set(result.characterId, window);
    }

    await stampSyncSubject(ctx, subject._id, [...windowsByCharacter.values()], args, now);
  },
});

async function applyOnlineResult(ctx: MutationCtx, userId: string, result: CharacterResult, existing: Doc<'characterOnline'> | undefined) {
  if (result.error !== null) return null;
  if (result.online === null) return result.expiresAt;
  if (existing === undefined) {
    await ctx.db.insert('characterOnline', { userId, characterId: result.characterId, online: result.online, etag: result.etag });
  } else if (existing.online !== result.online || existing.etag !== result.etag) {
    await ctx.db.patch(existing._id, { online: result.online, etag: result.etag });
  }
  return result.expiresAt;
}
```

<!-- uth:code id="code-live-online-sync" file="convex/onlineStatusSync.ts" lines="3-16,55-87,91-152" lang="ts" -->
```ts
// One run refreshes every linked character's online state for one user:
// heldState → Neon enumeration → eligibility + token vend + /online through the
// shared gate → one applySyncResults mutation.

export const syncUser = internalAction({
  args: { userId: v.string(), generation: v.number() },
  handler: async (ctx, { userId, generation }) => {
    const env = requireSyncEnv();
    const held = await ctx.runQuery(internal.onlineStatus.heldState, { userId });
    const heldByCharacter = new Map(held.map((h) => [h.characterId, h.etag]));
    const characters = await fetchEnumeratedCharacters(env, userId);

    const results: CharacterResult[] = [];
    const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };

    for (const character of characters) {
      const heldEtag = heldByCharacter.get(character.characterId) ?? null;
      const outcome = await syncOnlineCharacter(env, character, heldEtag, rl);
      if (outcome.kind === 'skip') continue;
      results.push(outcome.result);
      if (outcome.kind === 'stop') break;
    }

    await ctx.runMutation(internal.onlineStatus.applySyncResults, {
      userId,
      generation,
      enumeratedCharacterIds: characters.map((c) => c.characterId),
      results,
      ...rl,
    });
  },
});

async function syncOnlineCharacter(env: SyncEnv, character: SyncCharacter, heldEtag: string | null, rl: RlSnapshot) {
  if (!canSyncOnline(character)) {
    return { kind: 'result', result: errorResult(character.characterId, 'reauth_required', heldEtag) };
  }

  const vend = await vendCharacterToken(env, character.characterId);
  if (vend.kind === 'skip') return { kind: 'skip' };
  if (vend.kind === 'reauth') return { kind: 'result', result: errorResult(character.characterId, 'reauth_required', heldEtag) };

  const read = await readEsiAuthed(`/characters/${character.characterId}/online`, vend.accessToken, heldEtag, rl);
  if (read.kind === 'unchanged') {
    return { kind: 'result', result: { characterId: character.characterId, online: null, etag: heldEtag, expiresAt, error: null } };
  }

  const online = parseOnlineBody(read.body);
  return { kind: 'result', result: { characterId: character.characterId, online, etag: read.etag, expiresAt, error: null } };
}
```

<!-- uth:code id="code-live-skills-schema" file="src/features/skill-queue/schema.ts" lines="3-16,27-47" lang="ts" -->
```ts
// Neon storage for the skill-queue tracker — replacing the live Convex skills
// datasets. The skills + skillqueue ESI endpoints cache 120s and queue completion
// is a pure timestamp flip derived client-side.

export const characterSkills = pgTable('character_skills', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  totalSp: bigint('total_sp', { mode: 'number' }).notNull(),
  unallocatedSp: bigint('unallocated_sp', { mode: 'number' }),
  queue: jsonb('queue').$type<SkillQueueEntry[]>().notNull().default([]),
});

export const characterSkillSyncs = pgTable('character_skill_syncs', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  queueEtag: text('queue_etag'),
  skillsEtag: text('skills_etag'),
});
```

<!-- uth:code id="code-live-industry-jobs-schema" file="src/features/industry-jobs/schema.ts" lines="3-17,21-42,44-91" lang="ts" -->
```ts
// Neon storage for the personal industry-jobs tracker — replacing the live
// Convex industry-jobs datasets. The ESI endpoint caches 300s, and a job's
// "ready" is derived client-side from end_date.

export const characterIndustryJobs = pgTable('character_industry_jobs', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  jobs: jsonb('jobs').$type<IndustryJob[]>().notNull().default([]),
});

export const characterIndustryJobSyncs = pgTable('character_industry_job_syncs', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  jobsEtag: text('jobs_etag'),
});

// Corp jobs are keyed by (user_id, corporation_id), not corporation alone, because
// the board and role verdict are private to the signed-in user.
export const corpIndustryJobs = pgTable(
  'corp_industry_jobs',
  {
    userId: text('user_id').notNull(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    jobs: jsonb('jobs').$type<IndustryJob[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.userId, t.corporationId] })],
);

export const corpIndustryJobSyncs = pgTable(
  'corp_industry_job_syncs',
  {
    userId: text('user_id').notNull(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
    jobsEtag: text('jobs_etag'),
    syncError: text('sync_error'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.corporationId] })],
);
```

<!-- uth:code id="code-live-skills-on-view" file="src/db/skills-sync.ts" lines="3-14,63-76,83-92" lang="ts" -->
```ts
// Skill-queue composition layer. It touches BOTH auth (token vend, scope reads)
// AND the skill-queue slice, so it lives above the slices.

export async function getSkillsForUserOnView(userId: string): Promise<ViewerSkillsResult> {
  const linked = await listLinkedCharacters(userId);
  const characterIds = linked.map((character) => character.characterId);
  const [dataMap, syncStates] = await Promise.all([
    getSkillsForCharacters(characterIds),
    Promise.all(characterIds.map((id) => readCharacterSyncState(id))),
  ]);
  after(() => refreshSkillsForUser(makeSkillsPort(), userId));

  const characters: ViewerSkills[] = characterIds.map((characterId, i) => ({
    characterId,
    data: dataMap.get(characterId) ?? null,
    lastRefreshedAt: syncStates[i]?.lastRefreshedAt?.getTime() ?? null,
  }));

  const nameMap = await getTypeNames([...skillIds]);
  return { characters, names };
}
```

<!-- uth:code id="code-live-jobs-on-view" file="src/db/industry-jobs-sync.ts" lines="3-13,61-74,75-86" lang="ts" -->
```ts
// Personal industry-jobs composition layer. It reads cached boards immediately
// and fires a stale-gated write-behind refresh behind the response.

export async function getJobsForUserOnView(userId: string): Promise<ViewerJobsResult> {
  const linked = await listLinkedCharacters(userId);
  const characterIds = linked.map((character) => character.characterId);
  const [dataMap, syncStates] = await Promise.all([
    getJobsForCharacters(characterIds),
    Promise.all(characterIds.map((id) => readCharacterJobSyncState(id))),
  ]);
  after(() => refreshJobsForUser(makeJobsPort(), userId));

  const characters: ViewerJobs[] = characterIds.map((characterId, i) => ({
    characterId,
    data: dataMap.get(characterId) ?? null,
    lastRefreshedAt: syncStates[i]?.lastRefreshedAt?.getTime() ?? null,
  }));

  const nameMap = await getTypeNames([...new Set(jobTypeIds(characters))]);
  return { characters, names };
}
```

<!-- uth:code id="code-live-owner-sync-types" file="src/lib/owner-sync/types.ts" lines="3-11,73-108" lang="ts" -->
```ts
// Generic per-owner sync engine. The engine owns the mechanical dance every
// per-owner ESI→Neon slice clones: enumerate → stale-gate-before-vend → token /
// Director resolution → conditional fetch + plan → write-behind dispatch.

export interface OwnerSyncDescriptor<TOwner, TState, TSave> {
  now(): Date;
  enumerate(userId: string): Promise<EnumeratedOwner[]>;
  precondition?(owner: TOwner): Promise<boolean>;
  vendToken(characterId: number): Promise<string | null>;
  isStale(state: TState | null, now: Date): boolean;
  characterAxis?: OwnerAxis<TOwner>;
  corpAxis?: CorpOwnerAxis<TOwner>;
  readState(owner: TOwner): Promise<TState | null>;
  fetchAndPlan(owner: TOwner, accessToken: string, state: TState | null): Promise<PersistVerdict<TSave>>;
  save(owner: TOwner, payload: TSave): Promise<void>;
  stampFresh(owner: TOwner): Promise<void>;
  saveGateState?(owner: TOwner): Promise<void>;
}
```

<!-- uth:code id="code-live-owner-sync-engine" file="src/lib/owner-sync/engine.ts" lines="19-37,83-120,130-155" lang="ts" -->
```ts
export async function runOwnerSync<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  userId: string,
): Promise<void> {
  const owners = await descriptor.enumerate(userId);
  if (descriptor.characterAxis !== undefined) {
    await runCharacterPass(descriptor, descriptor.characterAxis, owners);
  }
  if (descriptor.corpAxis !== undefined) {
    await runCorpPass(descriptor, descriptor.corpAxis, userId, owners);
  }
}

// One owner, gated by staleness. resolveToken runs ONLY when the owner is stale.
async function syncOwner<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  owner: TOwner,
  resolveToken: () => Promise<TokenOutcome>,
): Promise<void> {
  if (descriptor.precondition !== undefined && !(await descriptor.precondition(owner))) return;

  const state = await descriptor.readState(owner);
  if (!descriptor.isStale(state, descriptor.now())) return;

  const token = await resolveToken();
  if (token.kind === 'skip') return;
  if (token.kind === 'needs_role') {
    await descriptor.saveGateState?.(owner);
    return;
  }

  const verdict = await descriptor.fetchAndPlan(owner, token.accessToken, state);
  switch (verdict.kind) {
    case 'skip':
      return;
    case 'stamp':
      await descriptor.stampFresh(owner);
      return;
    case 'needs_role':
      await descriptor.saveGateState?.(owner);
      return;
    case 'save':
      await descriptor.save(owner, verdict);
      return;
  }
}
```
<!-- uth:code-excerpts:end -->
