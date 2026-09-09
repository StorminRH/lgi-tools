import { test as base, expect, devices, chromium, firefox, webkit, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';
import { installOriginScopedBypass } from '../scripts/ux-remote-auth.cjs';
import { isLocalBaseUrl } from '../scripts/run-e2e-guard.cjs';
import { createDiagnostics, cspDirectiveFromConsole, requireBackend } from './diagnostics.cjs';
import { persistSanitizedFailure, sanitizedFailurePayload } from './sanitized-failure.cjs';
import { permitsReadOnlyHttp, permitsReadOnlySocket } from './readonly-policy.cjs';
import { createRunFixtures } from './fixture-data';

type OwnedData = Awaited<ReturnType<typeof createRunFixtures>>;
type Role = 'owner' | 'editor' | 'viewer' | 'unauthorized';
type Principal = { userId: string; characterId: number; name: string; role: Role };
type State = BrowserContextOptions['storageState'];
type Diagnostics = ReturnType<typeof createDiagnostics>;
type NewClient = { context: BrowserContext; page: Page; browser: Browser };
type Probe = {
  page: Page; viewport: string; baseUrl: string; engine: string;
  storageState: State; fixtures: OwnedData | null; diagnostics: Diagnostics;
  check: (label: string, condition: unknown) => boolean;
  createPage: () => Promise<Page>;
  createContext: (options?: { role?: Role; storageState?: State; engineName?: string; viewportName?: string }) => Promise<NewClient>;
  instant: (fn: () => Promise<void>, options?: Record<string, unknown>) => Promise<void>;
};
type Fixtures = {
  diagnostics: Diagnostics;
  ownedData: OwnedData | null;
  principal: Principal;
  authenticatedPage: Page;
  probe: Probe;
  probeAuthenticated: boolean;
  probeViewport: string;
};

function remotePrincipal(): Principal {
  const userId = process.env.E2E_EXPECTED_USER_ID;
  const name = process.env.E2E_EXPECTED_NAME;
  const characterId = Number(process.env.E2E_EXPECTED_CHARACTER_ID);
  if (!userId || !name || !Number.isSafeInteger(characterId) || characterId <= 0) {
    throw new Error('BLOCKED prerequisite: supplied remote session requires explicit expected user, character and name');
  }
  return { userId, characterId, name, role: 'owner' };
}

function watch(context: BrowserContext, diagnostics: Diagnostics) {
  const observe = (page: Page) => {
    page.on('response', (response) => diagnostics.recordHttp({
      url: response.url(), method: response.request().method(), status: response.status(),
    }));
    page.on('requestfailed', (request) => {
      const headers = request.headers();
      diagnostics.recordRequestFailure({
        url: request.url(), method: request.method(), error: request.failure()?.errorText,
        navigation: request.isNavigationRequest(), resourceType: request.resourceType(),
        prefetch: headers['next-router-prefetch'] !== undefined || headers.purpose === 'prefetch',
      });
    });
    page.on('pageerror', () => diagnostics.recordPageError());
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      const directive = cspDirectiveFromConsole(text);
      if (directive) {
        diagnostics.recordCsp(directive);
        return;
      }
      // HTTP response/request events own browser-generated resource errors.
      if (!text.startsWith('Failed to load resource:')) diagnostics.recordConsoleError();
    });
  };
  context.on('page', observe);
  for (const page of context.pages()) observe(page);
}

async function prepare(context: BrowserContext, baseURL: string, diagnostics: Diagnostics) {
  watch(context, diagnostics);
  await installOriginScopedBypass(context, baseURL);
  if (!isLocalBaseUrl(baseURL)) {
    await context.route('**/*', async (route) => {
      if (permitsReadOnlyHttp(route.request().method())) await route.fallback();
      else {
        diagnostics.recordReadOnlyViolation();
        await route.abort('blockedbyclient');
      }
    });
    await context.routeWebSocket('**/*', (socket) => {
      const upstream = socket.connectToServer();
      socket.onMessage((message) => {
        if (permitsReadOnlySocket(message)) upstream.send(message);
        else {
          diagnostics.recordReadOnlyViolation();
          void Promise.all([
            socket.close({ code: 1008, reason: 'Acceptance read-only policy' }),
            upstream.close({ code: 1008, reason: 'Acceptance read-only policy' }),
          ]).catch(() => diagnostics.recordReadOnlyViolation());
        }
      });
    });
  }
}

export const test = base.extend<Fixtures>({
  probeAuthenticated: [true, { option: true }],
  probeViewport: ['desktop', { option: true }],
  diagnostics: [async ({ baseURL, browser }, provide, info) => {
    const diagnostics = createDiagnostics({
      baseURL: baseURL ?? 'http://localhost:3000', lane: info.project.name, scenario: info.title,
      backendURL: process.env.NEXT_PUBLIC_CONVEX_URL,
    });
    info.annotations.push({ type: 'browser', description: browser.version() });
    let diagnosticsFailed = false;
    try {
      await provide(diagnostics);
      diagnostics.assertClean();
    } catch (error) {
      diagnosticsFailed = true;
      throw error;
    } finally {
      if (diagnosticsFailed || info.status !== info.expectedStatus) {
        const dest = persistSanitizedFailure(sanitizedFailurePayload({
          scenario: info.title.match(/^\[([\w-]+)\]/)?.[1] ?? 'unknown',
          lane: info.project.name,
          diagnostics: diagnostics.events,
          classification: info.errors.some((error) => /BLOCKED[: ]|E2E_PREREQUISITE/.test(error.message ?? ''))
            ? 'prerequisite' : 'failure',
        }), { id: info.testId });
        await info.attach('sanitized-failure', { contentType: 'application/json', path: dest });
      }
    }
  }, { auto: true }],
  context: async ({ context, baseURL, diagnostics }, provide) => {
    await prepare(context, baseURL ?? 'http://localhost:3000', diagnostics);
    await provide(context);
  },
  ownedData: [async ({ baseURL, diagnostics, probeAuthenticated }, provide, info) => {
    diagnostics.assertClean();
    if (!probeAuthenticated || !isLocalBaseUrl(baseURL)) { await provide(null); return; }
    const maps = ['local-mutation', 'benchmark'].includes(info.project.name) && /\[atlas-|\[fog-|\[layout-/.test(info.title);
    requireBackend({ required: maps, url: process.env.NEXT_PUBLIC_CONVEX_URL, deployment: process.env.CONVEX_DEPLOYMENT });
    const data = await createRunFixtures({ baseURL: baseURL ?? 'http://localhost:3000', maps });
    const restore = data.installProbeEnvironment();
    info.annotations.push({ type: 'fixture', description: data.runId });
    try { await provide(data); }
    finally {
      try {
        await data.cleanup();
        info.annotations.push({ type: 'cleanup', description: 'owned-data-absence-verified' });
      } finally { restore(); }
    }
  }, { timeout: 240_000 }],
  principal: async ({ ownedData }, provide) => {
    await provide(ownedData ? { ...ownedData.principals.owner, role: 'owner' } : remotePrincipal());
  },
  authenticatedPage: async ({ browser, baseURL, ownedData, principal, diagnostics }, provide, info) => {
    const state = ownedData?.principals.owner.storageState ?? process.env.E2E_STORAGE_STATE ?? process.env.UX_STORAGE_STATE;
    if (!state) throw new Error('BLOCKED prerequisite: authenticated storage state is missing');
    const context = await browser.newContext({ baseURL, storageState: state, serviceWorkers: 'block' });
    info.annotations.push({ type: 'auth-role', description: principal.role });
    try {
      await prepare(context, baseURL ?? 'http://localhost:3000', diagnostics);
      await provide(await context.newPage());
    }
    finally { await context.close(); }
  },
  probe: async ({ browser, baseURL, ownedData, diagnostics, probeAuthenticated, probeViewport }, provide, info) => {
    const contexts: BrowserContext[] = [];
    const browsers: NewClient['browser'][] = [];
    const target = baseURL ?? 'http://localhost:3000';
    const ownerState = ownedData?.principals.owner.storageState;
    const createContext: Probe['createContext'] = async (options = {}) => {
      const engine = options.engineName ?? 'chromium';
      const launcher = engine === 'firefox' ? firefox : engine === 'webkit' ? webkit : engine === 'chromium' ? chromium : null;
      if (!launcher) throw new Error('BLOCKED prerequisite: unsupported browser');
      const clientBrowser = engine === 'chromium' ? browser : await launcher.launch();
      if (clientBrowser !== browser) browsers.push(clientBrowser);
      const role = options.role ?? 'owner';
      const state = options.storageState ?? (probeAuthenticated ? ownedData?.principals[role].storageState : undefined);
      if (probeAuthenticated && !state) throw new Error('BLOCKED prerequisite: selected probe principal is missing');
      const context = await clientBrowser.newContext({
        ...((options.viewportName ?? probeViewport) === 'mobile' ? devices['Pixel 7'] : devices['Desktop Chrome']),
        baseURL: target, storageState: state, serviceWorkers: 'block',
      });
      contexts.push(context);
      await prepare(context, target, diagnostics);
      return { browser: clientBrowser, context, page: await context.newPage() };
    };
    try {
      const client = await createContext();
      info.annotations.push({ type: 'auth-role', description: probeAuthenticated ? 'owner' : 'guest' },
        { type: 'device', description: probeViewport === 'mobile' ? 'Pixel 7 touch' : 'Desktop Chrome' });
      await provide({
        page: client.page, viewport: probeViewport, baseUrl: target, engine: 'chromium',
        storageState: ownerState, fixtures: ownedData, diagnostics, createContext,
        createPage: () => client.context.newPage(),
        check: (label, condition) => { expect(condition, label).toBeTruthy(); return true; },
        instant: async (fn, options = {}) => {
          if (info.project.name !== 'dev-only') throw new Error('BLOCKED prerequisite: instant navigation requires dev-only');
          const { instant } = await import('@next/playwright');
          await instant(client.page, fn, { baseURL: target, ...options });
        },
      });
    } finally {
      for (const context of contexts.reverse()) await context.close();
      for (const clientBrowser of browsers) await clientBrowser.close();
    }
  },
});

export { expect };
