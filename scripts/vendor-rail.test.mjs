import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Durable fixtures for the 3.10.2.4 vendor rails, following
// scripts/ui-import-rail.test.mjs: lint synthetic text at a virtual path so each
// rule is exercised at the exact file position that decides it, with no probe
// file left in the tree.
//
// The regression probes at the bottom exist because these rails were added by
// editing roughly twenty flat-config blocks. Flat config REPLACES a rule's
// options per matching file, so the real risk is not that a new ban fails to
// fire — it is that re-listing dropped an existing one while lint stayed green.
describe('vendor rail', () => {
  const eslint = new ESLint({ cwd: repoRoot });

  async function messagesFor(filePath, code, ruleId) {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.filter((message) => message.ruleId === ruleId);
  }

  function importMessages(filePath, packageName) {
    return messagesFor(
      filePath,
      `import '${packageName}';\n`,
      'no-restricted-imports',
    );
  }

  const PROBE = 'src/features/wormhole-sites/vendor-rail-probe.ts';

  describe('vendor package ownership', () => {
    it.each([
      ['@upstash/redis', 'createUpstashClient'],
      ['@upstash/ratelimit', '@/lib/rate-limit'],
      ['@neondatabase/serverless', 'Database drivers are constructed only in @/db'],
      ['postgres', 'Database drivers are constructed only in @/db'],
      ['better-auth', 'Better Auth is consumed through @/platform/auth'],
      ['better-auth/plugins', 'Better Auth is consumed through @/platform/auth'],
      ['better-auth/adapters/drizzle', 'Better Auth is consumed through @/platform/auth'],
      ['convex/react', 'The Convex browser client is owned by @/data/convex/client'],
      ['google-auth-library', 'Google auth clients are constructed only in @/data/gsc'],
    ])('rejects a feature module importing %s', async (packageName, fragment) => {
      const messages = await importMessages(PROBE, packageName);
      expect(messages.some((message) => message.message.includes(fragment))).toBe(true);
    });

    it('rejects a vendor import inside the Convex isolate', async () => {
      const messages = await importMessages(
        'convex/vendorRailProbe.ts',
        '@upstash/redis',
      );
      expect(messages).not.toEqual([]);
    });

    it.each([
      ['src/lib/upstash.ts', '@upstash/redis'],
      ['src/lib/rate-limit.ts', '@upstash/ratelimit'],
      ['src/db/index.ts', '@neondatabase/serverless'],
      ['src/db/index.ts', 'postgres'],
      ['src/scripts/migrate.ts', 'postgres'],
      ['src/db/test-support/db-test-harness.ts', 'postgres'],
      ['src/db/advisory-lock.concurrency.test.ts', 'postgres'],
      ['src/platform/auth/auth.ts', 'better-auth/adapters/drizzle'],
      ['src/platform/auth/auth-client.ts', 'better-auth/react'],
      ['src/app/api/auth/[...all]/route.ts', 'better-auth/next-js'],
      ['src/app/industry/active-job-character-ids.ts', 'better-auth'],
      ['src/app/industry/active-job-character-ids.test.ts', 'better-auth'],
      ['src/data/convex/client.ts', 'convex/react'],
      ['src/platform/auth/components/ConvexClientProvider.tsx', 'convex/react'],
      ['src/components/OnlineStatusProvider.tsx', 'convex/react'],
      ['src/data/gsc/source.ts', 'google-auth-library'],
    ])('allows %s importing its own vendor %s', async (filePath, packageName) => {
      expect(await importMessages(filePath, packageName)).toEqual([]);
    });

    it.each([
      ['src/lib/upstash.ts', '@upstash/ratelimit'],
      ['src/lib/rate-limit.ts', '@upstash/redis'],
      ['src/data/gsc/source.ts', 'postgres'],
      ['src/data/convex/client.ts', 'better-auth'],
      ['src/platform/auth/auth.ts', 'convex/react'],
    ])('still rejects %s importing another vendor (%s)', async (filePath, packageName) => {
      expect(await importMessages(filePath, packageName)).not.toEqual([]);
    });
  });

  describe('bare fetch', () => {
    const CALL = 'export const probe = () => fetch("https://example.test");\n';

    it('rejects a bare fetch in production source', async () => {
      const messages = await messagesFor(PROBE, CALL, 'no-restricted-syntax');
      expect(
        messages.some((message) => message.message.includes('No bare `fetch`')),
      ).toBe(true);
    });

    it('rejects a bare fetch inside the Convex isolate', async () => {
      const messages = await messagesFor(
        'convex/vendorRailProbe.ts',
        CALL,
        'no-restricted-syntax',
      );
      expect(
        messages.some((message) => message.message.includes('No bare `fetch`')),
      ).toBe(true);
    });

    it.each(['src/lib/fetch-with-timeout.ts', 'src/transport/api-client.ts'])(
      'allows the sanctioned transport owner %s',
      async (filePath) => {
        const messages = await messagesFor(filePath, CALL, 'no-restricted-syntax');
        expect(
          messages.some((message) => message.message.includes('No bare `fetch`')),
        ).toBe(false);
      },
    );

    it('leaves test files free to stub fetch', async () => {
      const messages = await messagesFor(
        'src/features/wormhole-sites/probe.test.ts',
        CALL,
        'no-restricted-syntax',
      );
      expect(
        messages.some((message) => message.message.includes('No bare `fetch`')),
      ).toBe(false);
    });
  });

  describe('EVE SSO host ownership', () => {
    const LITERAL = 'export const url = "https://login.eveonline.com/v2/oauth/token";\n';
    const TEMPLATE = 'export const url = `https://login.eveonline.com/${"x"}`;\n';

    it.each([
      ['string literal', LITERAL],
      ['template literal', TEMPLATE],
    ])('rejects the SSO host as a %s in production source', async (_name, code) => {
      const messages = await messagesFor(PROBE, code, 'no-restricted-syntax');
      expect(
        messages.some((message) => message.message.includes("Don't hand-write EVE SSO URLs")),
      ).toBe(true);
    });

    it.each([
      'src/platform/auth/eve-sso-constants.ts',
      'src/platform/auth/eve-sso.ts',
      'src/proxy.ts',
    ])('allows the declared owner %s', async (filePath) => {
      const messages = await messagesFor(filePath, LITERAL, 'no-restricted-syntax');
      expect(
        messages.some((message) => message.message.includes("Don't hand-write EVE SSO URLs")),
      ).toBe(false);
    });
  });

  // One probe per touched block family, proving the rail that block already
  // carried still fires after its options were re-listed.
  describe('existing rails survive the re-listing', () => {
    it.each([
      ['src/components/ui/card.tsx', '@base-ui/react/dialog', 'Base UI'],
      ['src/features/industry-planner/probe.tsx', 'sonner', 'sonner'],
      ['src/components/ui/dialog.tsx', 'sonner', 'sonner'],
      ['src/components/ui/toast.tsx', '@base-ui/react/dialog', 'Base UI'],
      ['src/components/eve-image.tsx', 'sonner', 'sonner'],
      ['src/lib/esi-datasets/entries.ts', '@base-ui/react/dialog', 'Base UI'],
      ['src/app/api/cron/probe/route.ts', 'sonner', 'sonner'],
      // The client-addressable vendor homes must keep rejecting server roots.
      ['src/components/OnlineStatusProvider.tsx', '@/db', 'server roots'],
      ['src/platform/auth/components/ConvexClientProvider.tsx', '@/db', 'server roots'],
      ['src/platform/auth/auth-client.ts', '@/lib/rate-limit', 'server roots'],
    ])('keeps rejecting %s importing %s', async (filePath, packageName, fragment) => {
      const messages = await importMessages(filePath, packageName);
      expect(messages.some((message) => message.message.includes(fragment))).toBe(true);
    });

    it.each([
      // The vendor exemption blocks must not drop the inline-style ban.
      ['src/lib/upstash.ts'],
      ['src/db/index.ts'],
      ['src/data/gsc/source.ts'],
      ['src/lib/fetch-with-timeout.ts'],
      ['src/proxy.ts'],
    ])('keeps the raw-innerHTML ban in %s', async (filePath) => {
      const messages = await messagesFor(
        filePath,
        'export const set = (el) => { el.innerHTML = "x"; };\n',
        'no-restricted-syntax',
      );
      expect(
        messages.some((message) => message.message.includes('No raw `innerHTML`')),
      ).toBe(true);
    });

    it.each([
      ['src/lib/fetch-with-timeout.ts'],
      ['src/proxy.ts'],
      ['src/platform/auth/eve-sso.ts'],
    ])('keeps the ESI host ban in %s', async (filePath) => {
      const messages = await messagesFor(
        filePath,
        'export const url = "https://esi.evetech.net/latest/status/";\n',
        'no-restricted-syntax',
      );
      expect(
        messages.some((message) => message.message.includes("Don't hand-write ESI URLs")),
      ).toBe(true);
    });

    it('keeps the process.env ban in the SSO host owners', async () => {
      const messages = await messagesFor(
        'src/platform/auth/eve-sso.ts',
        'export const v = process.env.SOME_SECRET;\n',
        'no-restricted-syntax',
      );
      expect(
        messages.some((message) => message.message.includes('readEnv()')),
      ).toBe(true);
    });
  });
});
