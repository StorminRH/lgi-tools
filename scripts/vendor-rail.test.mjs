import { describe, it } from 'vitest';
import { createEslintRail } from './eslint-rail.mjs';

const {
  expectSyntax,
  expectImportHas,
  expectImportEmpty,
  expectImportNonEmpty,
} = createEslintRail(import.meta.url);

// Durable fixtures for the 3.10.2.4 vendor rails, following
// scripts/ui-import-rail.test.mjs: lint synthetic text at a virtual path so each
// rule is exercised at the exact file position that decides it, with no probe
// file left in the tree.
//
// The regression probes at the bottom exist because these rails were added by
// editing roughly twenty flat-config blocks. Flat config REPLACES a rule's
// options per matching file, so the real risk is not that a new ban fails to
// fire — it is that re-listing dropped an existing one while lint stayed green.
const PROBE = 'src/features/wormhole-sites/vendor-rail-probe.ts';
const CONVEX_PROBE = 'convex/vendorRailProbe.ts';
const FETCH_CALL = 'export const probe = () => fetch("https://example.test");\n';
const SSO_LITERAL = 'export const url = "https://login.eveonline.com/v2/oauth/token";\n';
const SSO_TEMPLATE = 'export const url = `https://login.eveonline.com/${"x"}`;\n';
const INNER_HTML = 'export const set = (el) => { el.innerHTML = "x"; };\n';
const ESI_URL = 'export const url = "https://esi.evetech.net/latest/status/";\n';
const PROCESS_ENV = 'export const v = process.env.SOME_SECRET;\n';

const rejectUpstashRedis = ['@upstash/redis', 'createUpstashClient'];
const rejectUpstashRatelimit = ['@upstash/ratelimit', '@/lib/rate-limit'];
const rejectNeon = ['@neondatabase/serverless', 'Database drivers are constructed only in @/db'];
const rejectPostgres = ['postgres', 'Database drivers are constructed only in @/db'];
const rejectBetterAuth = ['better-auth', 'Better Auth is consumed through @/platform/auth'];
const rejectBetterAuthPlugins = ['better-auth/plugins', 'Better Auth is consumed through @/platform/auth'];
const rejectBetterAuthDrizzle = ['better-auth/adapters/drizzle', 'Better Auth is consumed through @/platform/auth'];
const rejectConvexReact = ['convex/react', 'The Convex browser client is owned by @/data/convex/client'];
const rejectGoogleAuth = ['google-auth-library', 'Google auth clients are constructed only in @/data/gsc'];

const allowUpstashRedis = ['src/lib/upstash.ts', '@upstash/redis'];
const allowRateLimit = ['src/lib/rate-limit.ts', '@upstash/ratelimit'];
const allowNeonDb = ['src/db/index.ts', '@neondatabase/serverless'];
const allowPostgresDb = ['src/db/index.ts', 'postgres'];
const allowPostgresMigrate = ['src/scripts/migrate.ts', 'postgres'];
const allowPostgresHarness = ['src/db/test-support/db-test-harness.ts', 'postgres'];
const allowPostgresAdvisory = ['src/db/advisory-lock.concurrency.test.ts', 'postgres'];
const allowBetterAuthDrizzle = ['src/platform/auth/auth.ts', 'better-auth/adapters/drizzle'];
const allowBetterAuthReact = ['src/platform/auth/auth-client.ts', 'better-auth/react'];
const allowBetterAuthNext = ['src/app/api/auth/[...all]/route.ts', 'better-auth/next-js'];
const allowBetterAuthIndustry = ['src/app/(site)/industry/active-job-character-ids.ts', 'better-auth'];
const allowBetterAuthIndustryTest = ['src/app/(site)/industry/active-job-character-ids.test.ts', 'better-auth'];
const allowConvexClient = ['src/data/convex/client.ts', 'convex/react'];
const allowConvexProvider = ['src/platform/auth/components/ConvexClientProvider.tsx', 'convex/react'];
const allowConvexSync = ['src/data/convex/use-sync-subject.ts', 'convex/react'];
const allowGoogleGsc = ['src/data/gsc/source.ts', 'google-auth-library'];

const crossUpstashRatelimit = ['src/lib/upstash.ts', '@upstash/ratelimit'];
const crossRateLimitRedis = ['src/lib/rate-limit.ts', '@upstash/redis'];
const crossGscPostgres = ['src/data/gsc/source.ts', 'postgres'];
const crossConvexBetterAuth = ['src/data/convex/client.ts', 'better-auth'];
const crossAuthConvex = ['src/platform/auth/auth.ts', 'convex/react'];
const crossSyncBetterAuth = ['src/data/convex/use-sync-subject.ts', 'better-auth'];
const crossAuthClientConvex = ['src/platform/auth/auth-client.ts', 'convex/react'];
const crossAuthProviderConvex = ['src/platform/auth/components/AuthProvider.tsx', 'convex/react'];

const fetchOwnerTimeout = 'src/lib/fetch-with-timeout.ts';
const fetchOwnerApiClient = 'src/transport/api-client.ts';
const fetchTestStub = 'src/features/wormhole-sites/probe.test.ts';
const ssoOwnerConstants = 'src/platform/auth/eve-sso-constants.ts';
const ssoOwnerModule = 'src/platform/auth/eve-sso.ts';
const ssoOwnerProxy = 'src/proxy.ts';

const relistCardBaseUi = ['src/components/ui/card.tsx', '@base-ui/react/dialog', 'Base UI'];
const relistPlannerSonner = ['src/features/industry-planner/probe.tsx', 'sonner', 'sonner'];
const relistDialogSonner = ['src/components/ui/dialog.tsx', 'sonner', 'sonner'];
const relistToastBaseUi = ['src/components/ui/toast.tsx', '@base-ui/react/dialog', 'Base UI'];
const relistEveImageSonner = ['src/components/eve-image.tsx', 'sonner', 'sonner'];
const relistEsiEntriesBaseUi = ['src/lib/esi-datasets/entries.ts', '@base-ui/react/dialog', 'Base UI'];
const relistCronSonner = ['src/app/api/cron/probe/route.ts', 'sonner', 'sonner'];
const relistSyncServerRoot = ['src/data/convex/use-sync-subject.ts', '@/db', 'server roots'];
const relistProviderServerRoot = ['src/platform/auth/components/ConvexClientProvider.tsx', '@/db', 'server roots'];
const relistAuthClientServerRoot = ['src/platform/auth/auth-client.ts', '@/lib/rate-limit', 'server roots'];

const innerHtmlUpstash = 'src/lib/upstash.ts';
const innerHtmlDb = 'src/db/index.ts';
const innerHtmlGsc = 'src/data/gsc/source.ts';
const innerHtmlFetch = 'src/lib/fetch-with-timeout.ts';
const innerHtmlProxy = 'src/proxy.ts';
const esiBanFetch = 'src/lib/fetch-with-timeout.ts';
const esiBanProxy = 'src/proxy.ts';
const esiBanSso = 'src/platform/auth/eve-sso.ts';

describe('vendor rail', () => {
  describe('vendor package ownership', () => {
    it.each([
      rejectUpstashRedis,
      rejectUpstashRatelimit,
      rejectNeon,
      rejectPostgres,
      rejectBetterAuth,
      rejectBetterAuthPlugins,
      rejectBetterAuthDrizzle,
      rejectConvexReact,
      rejectGoogleAuth,
    ])('rejects a feature module importing %s', async (packageName, fragment) => {
      await expectImportHas(PROBE, packageName, fragment);
    });

    it('rejects a vendor import inside the Convex isolate', async () => {
      await expectImportNonEmpty(CONVEX_PROBE, '@upstash/redis');
    });

    it.each([
      allowUpstashRedis,
      allowRateLimit,
      allowNeonDb,
      allowPostgresDb,
      allowPostgresMigrate,
      allowPostgresHarness,
      allowPostgresAdvisory,
      allowBetterAuthDrizzle,
      allowBetterAuthReact,
      allowBetterAuthNext,
      allowBetterAuthIndustry,
      allowBetterAuthIndustryTest,
      allowConvexClient,
      allowConvexProvider,
      allowConvexSync,
      allowGoogleGsc,
    ])('allows %s importing its own vendor %s', async (filePath, packageName) => {
      await expectImportEmpty(filePath, packageName);
    });

    it.each([
      crossUpstashRatelimit,
      crossRateLimitRedis,
      crossGscPostgres,
      crossConvexBetterAuth,
      crossAuthConvex,
      crossSyncBetterAuth,
      crossAuthClientConvex,
      crossAuthProviderConvex,
    ])('still rejects %s importing another vendor (%s)', async (filePath, packageName) => {
      await expectImportNonEmpty(filePath, packageName);
    });
  });

  describe('bare fetch', () => {
    it('rejects a bare fetch in production source', () =>
      expectSyntax(PROBE, FETCH_CALL, 'No bare `fetch`'));
    it('rejects a bare fetch inside the Convex isolate', () =>
      expectSyntax(CONVEX_PROBE, FETCH_CALL, 'No bare `fetch`'));
    it.each([fetchOwnerTimeout, fetchOwnerApiClient])(
      'allows the sanctioned transport owner %s',
      (filePath) => expectSyntax(filePath, FETCH_CALL, 'No bare `fetch`', false),
    );
    it('leaves test files free to stub fetch', () =>
      expectSyntax(fetchTestStub, FETCH_CALL, 'No bare `fetch`', false));
  });

  describe('EVE SSO host ownership', () => {
    it.each([
      ['string literal', SSO_LITERAL],
      ['template literal', SSO_TEMPLATE],
    ])('rejects the SSO host as a %s in production source', (_name, code) =>
      expectSyntax(PROBE, code, "Don't hand-write EVE SSO URLs"));
    it.each([ssoOwnerConstants, ssoOwnerModule, ssoOwnerProxy])(
      'allows the declared owner %s',
      (filePath) => expectSyntax(filePath, SSO_LITERAL, "Don't hand-write EVE SSO URLs", false),
    );
  });

  describe('existing rails survive the re-listing', () => {
    it.each([
      relistCardBaseUi,
      relistPlannerSonner,
      relistDialogSonner,
      relistToastBaseUi,
      relistEveImageSonner,
      relistEsiEntriesBaseUi,
      relistCronSonner,
      relistSyncServerRoot,
      relistProviderServerRoot,
      relistAuthClientServerRoot,
    ])('keeps rejecting %s importing %s', async (filePath, packageName, fragment) => {
      await expectImportHas(filePath, packageName, fragment);
    });

    it.each([innerHtmlUpstash, innerHtmlDb, innerHtmlGsc, innerHtmlFetch, innerHtmlProxy])(
      'keeps the raw-innerHTML ban in %s',
      (filePath) => expectSyntax(filePath, INNER_HTML, 'No raw `innerHTML`'),
    );
    it.each([esiBanFetch, esiBanProxy, esiBanSso])(
      'keeps the ESI host ban in %s',
      (filePath) => expectSyntax(filePath, ESI_URL, "Don't hand-write ESI URLs"),
    );
    it('keeps the process.env ban in the SSO host owners', () =>
      expectSyntax(ssoOwnerModule, PROCESS_ENV, 'readEnv()'));
  });
});
