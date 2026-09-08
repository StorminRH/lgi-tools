const MAX_EVENTS = 100;

function requireBackend({ required, url, deployment }) {
  if (!required) return;
  if (!url || !deployment || !/^(local|anonymous):/.test(deployment)) {
    throw new Error('BLOCKED prerequisite: required local Convex backend is missing');
  }
  const target = new URL(url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('BLOCKED prerequisite: Convex must be local');
  }
}

function safeURL(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/[A-Za-z0-9_-]{40,}/g, '[redacted]')}`;
  } catch {
    return '[invalid-url]';
  }
}

/** @param {{baseURL: string, lane: string, scenario: string, backendURL?: string}} options */
function createDiagnostics({ baseURL, lane, scenario, backendURL }) {
  const origins = new Set([new URL(baseURL).origin]);
  if (backendURL) origins.add(new URL(backendURL).origin);
  const events = [];
  const expected = [];
  let failures = 0;
  const record = (event) => {
    if (event.disposition === 'unexpected') failures += 1;
    if (events.length < MAX_EVENTS) events.push(event);
  };
  const firstParty = (url) => {
    try { return origins.has(new URL(url).origin); } catch { return true; }
  };
  return {
    events,
    expectHttp({ pathname, method, status }) {
      if (!pathname.startsWith('/') || !/^[A-Z]+$/.test(method) || status < 400 || status >= 600) {
        throw new Error('Expected HTTP failures require an exact path, method and error status');
      }
      expected.push({ pathname, method, status });
    },
    recordHttp({ url, method, status }) {
      if (status < 400) return;
      const target = new URL(url);
      const allowed = target.origin === new URL(baseURL).origin && expected.some((item) =>
        item.pathname === target.pathname && item.method === method && item.status === status);
      record({ kind: 'http', url: safeURL(url), method, status,
        disposition: allowed ? 'expected' : firstParty(url) ? 'unexpected' : 'third-party' });
    },
    /** @param {{ url: string, method: string, error?: string }} failure */
    recordRequestFailure({ url, method, error }) {
      if (typeof error === 'string' && /ERR_ABORTED|NS_BINDING_ABORTED/.test(error)) return;
      record({ kind: 'request-failed', url: safeURL(url), method,
        disposition: firstParty(url) ? 'unexpected' : 'third-party' });
    },
    recordPageError() { record({ kind: 'page-error', disposition: 'unexpected' }); },
    recordConsoleError() { record({ kind: 'console-error', disposition: 'unexpected' }); },
    /** @param {string} [directive] */
    recordCsp(directive) {
      const safe = typeof directive === 'string' && /^[\w-]+$/.test(directive) ? directive : undefined;
      record({ kind: 'csp', disposition: 'unexpected', ...(safe ? { directive: safe } : {}) });
    },
    recordReadOnlyViolation() { record({ kind: 'read-only-write-prevented', disposition: 'unexpected' }); },
    assertClean() {
      if (failures) throw new Error(`DIAGNOSTICS: ${scenario} (${lane}) has ${failures} unexpected error(s)`);
    },
  };
}

module.exports = { requireBackend, safeURL, createDiagnostics };
