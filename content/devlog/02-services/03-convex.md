## Convex
<!-- updated: 2026-06-30 -->

Convex is the service in the stack that needs the most explanation, because it does not map cleanly to the older “app server plus database” picture.

The short version is that Convex gives an app a backend built around live data. It has a database, server-side functions, and client libraries that know how to subscribe to query results. A browser asks for data through a Convex query. Convex tracks what that query read. When the underlying data changes, the subscribed client can update without me building a separate websocket server, cache-invalidation layer, or polling loop.

That is why it was attractive for LGI.tools. EVE has several kinds of data that feel like they should move while the user is looking at the page: whether a character is online, whether a sync is running, whether shared map state changed, who is currently looking at a thing, and eventually the edits multiple scouts make to the same wormhole chain. In a more traditional EVE-tool setup, I might solve that with an always-on worker, a websocket server, an in-memory presence map, and a database behind it. Convex offered a managed version of that live coordination layer that fit better with the serverless shape of the rest of the project.

The catch is that Convex makes live state feel easy, and that is exactly where it can become dangerous. A reactive query is not just a nicer database read. It is a subscription. A write is not just a stored value. It may wake up clients. A heartbeat is not just a tiny ping. It is a repeated function call with cost and fan-out attached. The lesson I had to learn was that “this data changes” is not the same thing as “this data belongs in Convex.”

That is where the whiteboard metaphor came from. Neon is the filing cabinet: durable records, relational truth, tables I can rebuild features around. Convex is the whiteboard: small, live, watched state that should change in front of people while they are using the app. A whiteboard is useful because everyone looking at it sees the same thing. It is not where I should store every document in the building.

The current Convex schema encodes that boundary directly. Convex is a regenerable projection keyed by the same `userId` and `characterId` identities that live in Neon. It is not the system of record and it is not a home for EVE’s static domain data. If the Convex tables are wiped, the app should be able to rebuild the state from Neon plus EVE’s API. That boundary had to be clear before I could safely direct AI into the live-data work.<sup><a href="#code-convex-schema">1</a></sup>

[PR #90](https://github.com/StorminRH/lgi-tools/pull/90) was the foundation, and it was deliberately narrow. It connected Convex to the existing sign-in system without moving token custody there. Convex validates a short-lived JWT minted by the Next app, using the Better Auth user id as the subject. The browser-side client is also null-safe: if no Convex deployment URL is configured, the rest of the site keeps running. That matters because Convex is an optional live layer around specific features, not the thing the whole app must boot through.<sup><a href="#code-convex-auth">2</a></sup><sup><a href="#code-convex-client">3</a></sup>

The first real use case was broader than the system eventually needed. [PR #94](https://github.com/StorminRH/lgi-tools/pull/94) proved the end-to-end path with live skill queues: signed-in user identity, server-side character enumeration, external EVE reads, batched Convex writes, and reactive reads back to the page. Then [PR #97](https://github.com/StorminRH/lgi-tools/pull/97) generalized that into a presence-gated sync engine. A visible tab heartbeats the subject, a Convex cron scans due subjects, and bounded sync work keeps the data fresh while someone is watching. The goal was reasonable: cost should scale with subjects people are actively watching, not with the total number of linked characters sitting in the account database.<sup><a href="#code-convex-engine">4</a></sup>

That was a good architecture experiment, but it also exposed the mistake. Skill queues, personal industry jobs, and corporation industry jobs were useful features, but they were not really whiteboard data. They were slow EVE API data with cache windows. The visible countdowns could be derived in the browser from timestamps. Keeping an always-on reactive connection for them made the architecture more expensive without making the data meaningfully more live. [PR #175](https://github.com/StorminRH/lgi-tools/pull/175) moved those boards back to Neon as stale-gated on-view reads, and [PR #176](https://github.com/StorminRH/lgi-tools/pull/176) removed the dormant Convex tables and narrowed the engine down to one live consumer.

That correction changed the rule. Convex is not the place for “anything that updates.” Convex is for state where the live coordination itself is the feature.

The current keeper consumer is online status. [PR #174](https://github.com/StorminRH/lgi-tools/pull/174) added the live dot on character portraits before the slower boards moved away, so the engine would still have a real live feature exercising it. Online status is a better fit: it is tiny, it changes when the character logs in or out, and the user experience genuinely benefits from seeing that flip without a manual refresh. Even there, the implementation avoids noisy writes. An unchanged read writes nothing, an errored read keeps the last-known state, and a fresh response only patches the row if the online value or ETag actually changed. In a reactive system, no-op writes are not harmless because they can wake readers for no user-visible reason.<sup><a href="#code-convex-online">5</a></sup>

The client side of the engine follows the same rule. `useSyncSubject` does not poll the data endpoint. It sends a heartbeat over the existing Convex connection while the tab is visible, stops when the tab is hidden, and beats immediately when the tab becomes visible again. The server-side cold window owns the teardown. That means a background tab does not keep syncing just because it was once open, and a returning tab refreshes quickly without turning every hidden browser into background work.<sup><a href="#code-convex-heartbeat">6</a></sup>

The cost lessons are now part of the code. The engine separates the heartbeat clock from the sync cadence. Heartbeats are just liveness; dataset cadence lives in a registry. Presence lives in its own table so interval beats do not invalidate the heavier watched payload through Convex’s reactivity model. The scan has batch caps because a live backend still has capacity walls. These details are not incidental. They are the guardrails that keep a live system from becoming a quiet bill generator.<sup><a href="#code-convex-sync-config">7</a></sup><sup><a href="#code-convex-engine">4</a></sup>

The bigger reason Convex still matters is the mapper. A wormhole map is different from a skill queue. It is user-authored shared state: signatures, connections, notes, topology, presence, and edits that multiple scouts need to see together. That is the kind of data that actually behaves like a whiteboard. The current online-status tracker keeps the engine alive and proven, but the architecture is really being held open for that future use case.

So the Convex rule is now much clearer than it was when the live trackers first landed: use Convex for regenerable, live, watched state; keep durable truth and slow cached data in Neon; never store EVE token custody in Convex; and treat every reactive write as something that can wake up readers. Live is a feature, not a default storage choice.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-convex-schema" file="convex/schema.ts" lines="6-29,82-108" lang="ts" -->
```ts
// Convex is a regenerable projection of live ESI data keyed by the Neon
// identities (userId + characterId) — never the system of record, never a
// home for SDE/domain data. Wiping these tables and re-syncing must
// reproduce the same state from Neon + ESI.
//
// Since MIGRATE.B the engine serves a SINGLE live consumer — onlineStatus.

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
  }).index('by_user_dataset', ['userId', 'dataset']),

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

<!-- uth:code id="code-convex-auth" file="convex/auth.config.ts" lines="5-46" lang="ts" -->
```ts
// Validation of the spine's Convex-facing JWT. The minting side lives in the
// Next.js app (Better Auth jwt plugin): ES256, `iss` = BETTER_AUTH_URL,
// `aud` = 'convex', `sub` = the Better Auth user id.
//
// No EVE credentials ever live in Convex; token custody and refresh stay on
// the Neon side.

const issuer = process.env.AUTH_ISSUER_URL;
const jwks = process.env.AUTH_JWKS;

export default {
  providers:
    issuer && jwks
      ? [
          {
            type: 'customJwt',
            issuer,
            algorithm: 'ES256',
            jwks,
            applicationID: 'convex',
          },
        ]
      : [],
} satisfies AuthConfig;
```

<!-- uth:code id="code-convex-client" file="src/data/convex/client.ts, src/features/auth/components/ConvexClientProvider.tsx" lines="5-15,23-52" lang="tsx" -->
```tsx
// NEXT_PUBLIC_CONVEX_URL is a literal static read by design: Next inlines it
// into every bundle at build time, and on Vercel the value exists ONLY in the
// build env. When unset, the client is null and every consumer degrades
// gracefully — the rest of the site runs.

export const convexClient: ConvexReactClient | null = url ? new ConvexReactClient(url) : null;

function useAuthForConvex() {
  const { session, loading } = useAuth();
  const isAuthenticated = session !== null;

  const fetchAccessToken = useCallback(async () => {
    try {
      const result = await apiFetch(tokenEndpoint);
      return result.ok ? result.data.token : null;
    } catch {
      return null;
    }
  }, []);

  return useMemo(
    () => ({ isLoading: loading, isAuthenticated, fetchAccessToken }),
    [loading, isAuthenticated, fetchAccessToken],
  );
}

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  if (convexClient === null) return <>{children}</>;
  return (
    <ConvexProviderWithAuth client={convexClient} useAuth={useAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}
```

<!-- uth:code id="code-convex-engine" file="convex/engine.ts" lines="3-35,84-112,121-132" lang="ts" -->
```ts
// THE presence-gated sync engine. A subject (dataset × user) is refreshed on
// its dataset's cadence only while some visible tab is heartbeating it; cost
// scales with concurrently-watched subjects, never with total linked characters.
//
// Mechanism: heartbeats maintain presence and dispatch immediately when the
// data is stale; a static 30s cron scans subjects whose nextDueAt has arrived,
// skips cold or still-running ones, and dispatches the rest through the Workpool.

const pool = new Workpool(components.workpool, { maxParallelism: 4 });

const rateLimiter = new RateLimiter(components.rateLimiter, {
  syncDispatch: { kind: 'token bucket', period: MINUTE, rate: 30, capacity: 10 },
});

const syncDatasetValidator = v.literal('onlineStatus');

const SYNC_REFS = {
  onlineStatus: internal.onlineStatusSync.syncUser,
} satisfies Record<SyncDataset, unknown>;

export const SCAN_DISPATCH_BATCH = 1024;
```

<!-- uth:code id="code-convex-online" file="convex/onlineStatus.ts" lines="23-44,75-123,125-155" lang="ts" -->
```ts
// The COLD-equivalent viewer wire: the calling user's per-character online flag.
// The apply writes that table ONLY on a genuine online↔offline change, so this
// query re-fires only when a character's online state actually flips.

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

async function applyOnlineResult(ctx, userId, result, existing) {
  if (result.error !== null) return null;
  if (result.online === null) return result.expiresAt;

  if (existing === undefined) {
    await ctx.db.insert('characterOnline', {
      userId,
      characterId: result.characterId,
      online: result.online,
      etag: result.etag,
    });
  } else if (existing.online !== result.online || existing.etag !== result.etag) {
    await ctx.db.patch(existing._id, { online: result.online, etag: result.etag });
  }
  return result.expiresAt;
}
```

<!-- uth:code id="code-convex-heartbeat" file="src/data/convex/use-sync-subject.ts" lines="5-53" lang="ts" -->
```ts
// The client half of the presence-gated sync engine: a visibility-gated
// heartbeat. While the tab is visible, beat every HEARTBEAT_MS; on hide, stop;
// on return, beat immediately so a stale view refreshes at once.

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

<!-- uth:code id="code-convex-sync-config" file="src/lib/sync-engine.ts" lines="16-63,76-97" lang="ts" -->
```ts
// The engine serves a SINGLE live consumer: onlineStatus. The three slow
// trackers moved to Neon stale-gated on-view reads in MIGRATE.B.

export const SYNC_DATASETS = ['onlineStatus'] as const;

export const SYNC_DATASET_CONFIG: Record<
  SyncDataset,
  { cadenceFloorMs: number; tokenGroup: string }
> = {
  onlineStatus: { cadenceFloorMs: 60_000, tokenGroup: 'char-online' },
};

export const HEARTBEAT_MS = 20_000;
export const COLD_AFTER_MS = 60_000;
export const RETENTION_MS = 7 * 24 * 60 * 60_000;

export function isColdFromPresence(lastSeenAt: number | null, now: number): boolean {
  return lastSeenAt === null || isCold(lastSeenAt, now);
}

export function isRunningFresh(
  status: 'idle' | 'running',
  lastRequestedAt: number,
  now: number,
): boolean {
  return status === 'running' && now - lastRequestedAt < STALE_RUNNING_MS;
}
```
<!-- uth:code-excerpts:end -->
