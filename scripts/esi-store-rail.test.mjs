import { describe, expect, it } from 'vitest';
import { createEslintRail } from './__tests__/eslint-rail.mjs';

const rail = createEslintRail(import.meta.url);
const boundary = 'esi-store/boundary';
const syntax = 'no-restricted-syntax';

const consumer = 'src/composition/sync/esi-store-probe.ts';
const cacheLifeExpiry = 'cacheLife on EVE data takes untilExpires';
const esiHeader = 'Expires, ETag and Last-Modified are read only by';

describe('ESI read boundary', () => {
  it('blocks the gate fetch and the authed reads outside the store, however they are spelled', async () => {
    for (const code of [
      "import { esiFetch } from '@/platform/esi';",
      "import { esiFetch as call } from '@/platform/esi';",
      "import { readEsiAuthed, readEsiPagedAuthed } from '@/platform/esi/authed-read';",
      "import { readEsiAuthedPost } from '../../platform/esi/authed-read';",
      "import * as esi from '@/platform/esi';",
      "export { esiFetch } from '@/platform/esi';",
      "export * from '@/platform/esi/authed-read';",
      "const esi = await import('@/platform/esi');",
      "import { esiFetch } from '@/platform/esi/index';",
      "import { esiFetch } from '../../platform/esi/index.ts';",
      "import { esiFetch } from '@/platform/esi/';",
      "import { readEsiAuthed } from '@/platform/esi/authed-read.ts';",
      "import { readEsiAuthedPost } from '../../platform/esi/authed-read.mjs';",
      "export * from '@/platform/esi/index';",
    ]) {
      expect((await rail.messagesFor(consumer, code, boundary)).length, code).toBeGreaterThan(0);
    }
    expect(await rail.messagesFor(consumer, "import { readEsiAuthed, readEsiPagedAuthed } from '@/platform/esi/authed-read';", boundary)).toHaveLength(2);
  });

  it('allows the store API, the gate errors and URL builder, header helpers and types', async () => {
    for (const code of [
      "import { fetchStored, readStoredAuthed, esiPassThrough } from '@/data/esi-store';",
      "import { EsiBudgetExhaustedError, EsiServerError, esiUrl } from '@/platform/esi';",
      "import { esiAuthInit } from '@/platform/esi/request-init';",
      "import { httpDateMs } from '@/platform/esi/headers';",
      "import type { EsiAuthedRead } from '@/platform/esi/authed-read';",
      "import { type EsiFetchOptions, esiUrl } from '@/platform/esi';",
      "import { esiUrl } from '@/platform/esi/index';",
      "import { EsiServerError } from '@/platform/esi/index.ts';",
    ]) {
      expect(await rail.messagesFor(consumer, code, boundary), code).toEqual([]);
    }
  });

  it('leaves the store, the host and tests free to call the gate', async () => {
    const code = "import { esiFetch } from '@/platform/esi';";
    for (const file of [
      'src/data/esi-store/index.ts',
      'src/platform/esi/dispatch.ts',
      'src/composition/sync/esi-store-probe.test.ts',
    ]) {
      expect(await rail.messagesFor(file, code, boundary), file).toEqual([]);
    }
  });

  it('keeps the corp-access boundary on its own readers', async () => {
    expect(await rail.messagesFor(consumer, "import { getUserAffiliations } from '@/platform/auth/affiliation-store';", 'corp-access/boundary')).toHaveLength(1);
    expect(await rail.messagesFor(consumer, "import type { getUserAffiliations } from '@/platform/auth/affiliation-store';", 'corp-access/boundary')).toEqual([]);
    expect(await rail.messagesFor(consumer, "import { getUserAffiliations } from '@/platform/auth/affiliation-store/index';", 'corp-access/boundary')).toHaveLength(1);
  });
});

describe('cacheLife rail', () => {
  it("rejects every profile but 'max' and untilExpires(…)", async () => {
    for (const code of [
      "cacheLife('hours');",
      "cacheLife('minutes');",
      'cacheLife({ stale: 60, revalidate: 60, expire: 60 });',
      'cacheLife(FIVE_MINUTES);',
      'cacheLife();',
    ]) {
      await rail.expectSyntax(consumer, code, cacheLifeExpiry);
    }
  });

  it("accepts 'max' and untilExpires(…)", async () => {
    for (const code of ["cacheLife('max');", 'cacheLife(untilExpires(expiresAt));', 'cacheLife(untilExpires(null));']) {
      await rail.expectSyntax(consumer, code, cacheLifeExpiry, false);
    }
  });

  it('exempts only the linked-character list and the health scoreboard', async () => {
    for (const file of ['src/app/(site)/industry/industry-characters.ts', 'src/composition/esi-health.ts']) {
      await rail.expectSyntax(file, "cacheLife('minutes');", cacheLifeExpiry, false);
    }
    await rail.expectSyntax('src/data/esi-store/index.ts', "cacheLife('minutes');", cacheLifeExpiry);
  });
});

describe('ESI header rail', () => {
  it('rejects reading Expires, ETag and Last-Modified in any case or quoting', async () => {
    for (const code of [
      "res.headers.get('Expires');",
      'res.headers.get("etag");',
      'res.headers.get(`Last-Modified`);',
      "headers?.get('EXPIRES');",
    ]) {
      await rail.expectSyntax(consumer, code, esiHeader);
    }
  });

  it('leaves other headers alone', async () => {
    for (const code of ["res.headers.get('X-Pages');", "res.headers.get('etag-x');", "map.get('expires_at');"]) {
      await rail.expectSyntax(consumer, code, esiHeader, false);
    }
  });

  it('exempts the host, the store and the anoik statics feed', async () => {
    for (const file of ['src/platform/esi/authed-read.ts', 'src/data/esi-store/index.ts', 'src/data/wh-statics/source.ts']) {
      await rail.expectSyntax(file, "res.headers.get('Expires');", esiHeader, false);
    }
  });

  it('keeps every other production rail on the exempted owners', async () => {
    for (const file of ['src/data/esi-store/index.ts', 'src/composition/esi-health.ts']) {
      const messages = await rail.messagesFor(file, "fetch('/example');", syntax);
      expect(messages.length, file).toBeGreaterThan(0);
    }
  });
});
