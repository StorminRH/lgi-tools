## Neon

Neon is the boring part of LGI.tools on purpose: it is Postgres.

That was the appeal. I did not want the project’s most important records living in a clever app-specific store that only made sense while the current architecture stayed exactly the same. Accounts, linked EVE characters, tokens, market snapshots, SDE tables, planner inputs, structures, telemetry, and purge records all need to survive beyond one request and outlive whatever UI I build on top of them. For that kind of state, I wanted a real relational database with migrations, constraints, indexes, SQL, and a data model I could inspect directly.

Neon gives me that, but in a shape that fits the rest of the serverless stack. It is still Postgres, but it is managed like a cloud service: it can branch, it can scale down when idle, and it has connection options meant for short-lived serverless functions. That combination is the reason it fit LGI.tools. I got the familiarity of Postgres without having to run a permanent database server myself.

The tradeoff is that “serverless Postgres” is not the same mental model as a traditional always-on database sitting beside a VPS. A quiet database can be asleep. A preview branch can be a real copy of the data shape, not just a pretend environment. A pooled connection can be exactly right for normal web traffic and exactly wrong for code that depends on a stable database session. The service makes some hard things easier, but it also means the repo has to be explicit about which kind of database access each job is allowed to use.

That is why this section is called “one database, two ways in.” The database itself is the durable core. The connection path is the part that needed discipline.

The repo keeps the data model feature-shaped instead of piling every table into one giant schema file. Feature and data slices own their tables near the code that uses them, then `src/db/schema.ts` re-exports those slices so Drizzle sees one complete relational model when it generates migrations. That is a small structure decision, but it matters with AI-generated code. A new feature can add its own schema without being allowed to invent a second database pattern. The later feature chapters explain what these slices actually do; this section is about the database boundary itself.<sup><a href="#code-neon-schema">1</a></sup>

The first path is the normal request path. Most user-facing reads should be short, fresh, and disposable. A Vercel function wakes up, asks the database for what it needs, returns the page or API response, and goes away. For that work, the repo uses Neon’s HTTP driver. That choice came from [PR #58](https://github.com/StorminRH/lgi-tools/pull/58), after the site hit a serverless failure mode I had not fully appreciated: when the hosted database scaled down, a long-held connection could look fine from the app’s side but be dead in practice. The first visitor after a quiet period could get a database error instead of a page. Moving request-path reads to the HTTP driver changed the shape of that failure. Each query behaves like a fresh HTTP request, so a sleeping compute turns into a slower first read instead of a stale socket.<sup><a href="#code-neon-request-db">2</a></sup>

That fixed production and immediately broke local development. A local Docker Postgres is not a Neon HTTP endpoint. [PR #60](https://github.com/StorminRH/lgi-tools/pull/60) added the explicit local-only escape hatch: when `LOCAL_DB_DRIVER=postgres-js`, the request path uses a TCP driver locally, while production and preview stay on Neon HTTP. I like that compromise because it does not hide the difference. The repo admits that local and hosted environments have different connection mechanics, then fences that difference behind one env-controlled branch instead of scattering special cases through the app.<sup><a href="#code-neon-request-db">2</a></sup>

The second path exists because a few jobs need a stable Postgres session. Most of the app should not hold database sessions open. But some shared data refreshes need database-level coordination so two copies do not rewrite the same tables at the same time. In [PR #34](https://github.com/StorminRH/lgi-tools/pull/34), I learned that the original lock path was not as safe as it looked. The jobs were using Neon’s pooled endpoint, and PgBouncer transaction pooling can recycle the backend between statements. A session-scoped advisory lock only means something if the session is stable. Through the pooler, the code could appear to take a lock while not actually serializing the work.

That became a hard boundary: request-path queries use the connectionless HTTP lane; lock-holding jobs use the direct, unpooled lane. The resolver prefers `DATABASE_URL_UNPOOLED`, falls back to `DATABASE_URL` for local Docker, and fails closed if the resolved URL is still a `-pooler` host. That fail-closed part is important. A missing direct connection should stop the job, not let it run with a lock that only looks real.<sup><a href="#code-neon-direct-db">3</a></sup>

[PR #49](https://github.com/StorminRH/lgi-tools/pull/49) tightened that into a regression rail. The resolver test proved the rule in isolation, but there was still a gap: a future refactor could accidentally construct the direct client without going through the resolver. The added test mocks the `postgres` driver and touches the lazy proxy, proving that `directClient` actually resolves through the unpooled path and throws before constructing anything when only a pooled URL is available. That is exactly the kind of bug AI can reintroduce during “cleanup” work, so the code now tests the wiring, not just the helper.<sup><a href="#code-neon-direct-tests">4</a></sup><sup><a href="#code-neon-connection-tests">5</a></sup>

There is also a build-time version of the same database lesson. Once pages became mostly static or partial-prerendered, `next build` itself started reading from Neon. That made database sleep behavior a deploy concern, not just a runtime concern. [PR #99](https://github.com/StorminRH/lgi-tools/pull/99) added a narrow retry wrapper around build-time cached reads: retry the cold-start-shaped database errors, never retry real SQL or logic errors, and never return an empty result just to make a build pass. The data-pipeline chapter later gets into the specific bootstrap work that had to be narrowed after a deploy failure; the Neon lesson is simpler: build-time database reads have their own failure mode, and pretending they are the same as request-time reads is how bad cached output gets shipped.

That is the pattern Neon forced into the architecture. The database is durable, but the connection is not a generic detail. Normal reads, coordinated background writes, build-time reads, local development, and preview cleanup all have different failure modes. The mistake would be treating Postgres as one simple resource and letting every AI-generated feature reach for it however it wants.

The better rule is more specific: put durable relational state in Neon, keep schemas owned by their feature slices, use HTTP for request-path work, use direct unpooled sessions only when a job truly needs session semantics, and make dangerous paths fail loudly when the environment is wrong.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-neon-schema" file="src/db/schema.ts" lines="3-20" lang="ts" ref="5d16c056340da1fa70ad385dd7bab0b1140f7282" -->
```ts id="r6v2bk"
// Feature tables live alongside their feature in `src/features/<name>/schema.ts`
// and are re-exported from here so drizzle-kit sees them all in one place.
// Schema stays extensible; features add their own tables.

export * from '../features/wormhole-sites/schema';
export * from '../data/eve-data/schema';
export * from '../data/market-prices/schema';
export * from '../data/market-history/schema';
export * from '../data/industry-indices/schema';
export * from '../features/auth/schema';
export * from '../features/owned-blueprints/schema';
export * from '../features/owned-assets/schema';
export * from '../features/owned-structures/schema';
export * from '../features/custom-structures/schema';
export * from '../features/skill-queue/schema';
export * from '../features/industry-jobs/schema';
export * from '../data/telemetry/schema';
export * from '../data/gsc/schema';
```

<!-- uth:code id="code-neon-request-db" file="src/db/index.ts" lines="17-42" lang="ts" -->
```ts id="nv7hk4"
function getClient(): HttpClient {
  if (_client) return _client;
  const url = requireEnv('DATABASE_URL');
  // Neon HTTP driver: one `fetch` per query, no TCP connection held. A Neon
  // compute that has scaled to zero slows the first query instead of erroring
  // it on a dead socket — that's the production-outage fix.
  _client = neon(url);
  return _client;
}

function getDb(): Db {
  if (_db) return _db;
  // Dev-only escape hatch: the neon-http driver speaks HTTP to a Neon SQL
  // endpoint and cannot reach a plain local Postgres, so local `next dev`
  // would 500 every request-path DB read.
  if (readEnv('LOCAL_DB_DRIVER') === 'postgres-js') {
    const url = requireEnv('DATABASE_URL');
    _db = drizzlePg(postgres(url)) as unknown as Db;
    return _db;
  }
  _db = drizzleHttp({ client: getClient() });
  return _db;
}
```

<!-- uth:code id="code-neon-direct-db" file="src/db/index.ts" lines="45-103" lang="ts" -->
```ts id="h9m3qd"
// A Neon connection string is "pooled" when its host carries the `-pooler`
// suffix — that endpoint is PgBouncer in transaction mode, which recycles the
// underlying backend between statements and so cannot hold a session-scoped
// advisory lock.

export function resolveLockConnectionUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (isPooledHost(url)) {
    throw new Error(
      'Refusing to hold a session advisory lock on a pooled (-pooler) connection: ' +
        'set DATABASE_URL_UNPOOLED to the direct Neon endpoint. ' +
        'Session-scoped locks do not hold through PgBouncer transaction-mode pooling.',
    );
  }
  return url;
}

function getDirectClient(): Sql {
  if (_directClient) return _directClient;
  _directClient = postgres(resolveLockConnectionUrl(), { max: 3 });
  return _directClient;
}

export const directClient: Sql = new Proxy({} as Sql, {
  get(_target, prop) {
    return (getDirectClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
```

<!-- uth:code id="code-neon-direct-tests" file="src/db/direct-client.test.ts" lines="5-43" lang="ts" -->
```ts id="mz2v18"
// Guards C-1: the lock-holder connection `directClient`
// must resolve its URL through resolveLockConnectionUrl, so it stays fail-closed off
// a pooled (`-pooler`) endpoint even if the connection wiring is later refactored.
// connection.test.ts guards the resolver in isolation; this guards that directClient
// actually goes through it — the gap a wiring change could silently reopen.

describe('directClient wiring (lock-holder connection)', () => {
  it('constructs on the unpooled endpoint via resolveLockConnectionUrl', async () => {
    vi.stubEnv('DATABASE_URL', POOLED);
    vi.stubEnv('DATABASE_URL_UNPOOLED', DIRECT);
    const { directClient } = await import('./index');
    void directClient.reserve; // trigger the lazy Proxy → getDirectClient()
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith(DIRECT, expect.anything());
  });

  it('fails closed when only a pooled connection is configured', async () => {
    vi.stubEnv('DATABASE_URL', POOLED); // no DATABASE_URL_UNPOOLED
    const { directClient } = await import('./index');
    expect(() => void directClient.reserve).toThrow(/-pooler/);
    expect(postgresMock).not.toHaveBeenCalled(); // threw before constructing
  });
});
```

<!-- uth:code id="code-neon-connection-tests" file="src/db/connection.test.ts" lines="40-66,77-84" lang="ts" -->
```ts id="p5vqun"
describe('resolveLockConnectionUrl', () => {
  it('prefers DATABASE_URL_UNPOOLED and resolves to a non-pooled host', () => {
    const url = resolveLockConnectionUrl({
      DATABASE_URL: POOLED,
      DATABASE_URL_UNPOOLED: DIRECT,
    });
    expect(url).toBe(DIRECT);
    expect(isPooledHost(url)).toBe(false);
  });

  it('fails closed when only a pooled DATABASE_URL is available', () => {
    expect(() => resolveLockConnectionUrl({ DATABASE_URL: POOLED })).toThrow(
      /-pooler/,
    );
  });
});

describe('request-path db (Neon HTTP driver)', () => {
  it('lazily constructs the neon-http client off DATABASE_URL on first use', async () => {
    const { db } = await import('./index');
    expect(neonMock).not.toHaveBeenCalled();
    void db.select;
    expect(neonMock).toHaveBeenCalledWith(POOLED);
  });
});
```
<!-- uth:code-excerpts:end -->

