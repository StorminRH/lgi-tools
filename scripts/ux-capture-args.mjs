// Pure, import-safe helpers for the UX capture utility (scripts/ux-capture.mjs),
// extracted so the arg parsing, slug assignment, and report-row shaping are unit
// tested without launching a browser. Node builtins only — no playwright, no side
// effects, no top-level execution.

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

// --- args -------------------------------------------------------------------
// Positionals are route paths; `--flag=value` are options. No args → smoke `/`.
export function applyFlag(opts, key, value) {
  if (key === 'base-url') opts.baseUrl = value;
  else if (key === 'settle') {
    const n = Number(value);
    if (!Number.isNaN(n)) opts.settle = n; // allow --settle=0 (0 is valid, not "unset")
  } else if (key === 'viewport' || key === 'viewports') {
    opts.viewports = value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v in VIEWPORTS);
  } else console.error(`  (ignoring unknown flag --${key})`);
}

export function parseArgs(argv) {
  const routes = [];
  const opts = {
    // localhost, never 127.0.0.1: Next dev (Turbopack) blocks /_next/* dev
    // assets cross-origin from a 127.0.0.1 Host (allowedDevOrigins), so the HMR
    // handshake fails and pages silently render the SSR shell unhydrated — no
    // client fetches, no errors. The server may still be *bound* to 127.0.0.1
    // (`next dev -H 127.0.0.1`); only the browsed URL must be localhost.
    baseUrl: process.env.UX_BASE_URL ?? 'http://localhost:3000',
    viewports: ['desktop', 'mobile'],
    settle: 1500,
  };
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value = ''] = arg.slice(2).split('=');
      applyFlag(opts, key, value);
    } else {
      routes.push(arg.startsWith('/') ? arg : `/${arg}`);
    }
  }
  if (routes.length === 0) {
    routes.push('/');
    console.error("ℹ no routes passed — capturing '/' as a smoke check.");
    console.error('  normally you pass the routes this session touched, e.g.');
    console.error('  pnpm ux-check /sites /sites/30002 /industry');
  }
  if (opts.viewports.length === 0) opts.viewports = ['desktop', 'mobile'];
  return { routes, opts };
}

// `/` → home; `/sites/[id]` → sites-id; trailing/leading slashes collapsed.
export function slugify(route) {
  const s = route.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-');
  return s || 'home';
}

// Pair each route with a unique filename slug. slugify() collapses every
// separator run to one `-`, so routes differing only in punctuation (`/a/b` vs
// `/a-b`) would otherwise share a file and silently overwrite each other —
// disambiguate collisions with a numeric suffix.
export function assignSlugs(routes) {
  const used = new Set();
  return routes.map((route) => {
    const base = slugify(route);
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    return { route, slug };
  });
}

// --- report row shaping -----------------------------------------------------
// One network line per result: the first 4xx/5xx if any, else the first failed
// request. Callers only reach this when a result has at least one of the two.
export function networkFirst(r) {
  return r.httpErrors[0]
    ? `${r.httpErrors[0].status} ${r.httpErrors[0].url}`
    : `${r.failedRequests[0].error} ${r.failedRequests[0].url}`;
}

// Shape the sweep results into the three finding tables + total shot count the
// summary prints. Pure: no console, no fs — the entry does the logging.
export function summariseResults(results) {
  const shotCount = results.reduce((n, r) => n + r.screenshots.length, 0);
  const loadRows = results
    .filter((r) => r.loadError)
    .map((r) => `${r.route} [${r.viewport}]: ${r.loadError}`);
  const consoleRows = results
    .filter((r) => r.consoleErrors.length || r.pageErrors.length)
    .map((r) => {
      const msgs = [...r.consoleErrors, ...r.pageErrors];
      return `${r.route} [${r.viewport}]: ${msgs.length} — ${msgs[0]}`;
    });
  const networkRows = results
    .filter((r) => r.failedRequests.length || r.httpErrors.length)
    .map((r) => `${r.route} [${r.viewport}]: ${r.failedRequests.length + r.httpErrors.length} — ${networkFirst(r)}`);
  return { shotCount, loadRows, consoleRows, networkRows };
}
