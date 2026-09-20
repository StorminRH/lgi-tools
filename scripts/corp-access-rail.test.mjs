import { describe, expect, it } from 'vitest';
import { createEslintRail } from './__tests__/eslint-rail.mjs';

const rail = createEslintRail(import.meta.url);
const rule = 'corp-access/boundary';

describe('corporation access boundary', () => {
  it('blocks named aliases and namespace reads', async () => {
    for (const code of [
      "import { getUserAffiliations as read } from '@/platform/auth/affiliation-store';",
      "import * as store from '../../platform/auth/affiliation-store';",
    ]) {
      expect(await rail.messagesFor('src/composition/sync/example.ts', code, rule)).toHaveLength(1);
    }
  });

  it('allows the public resolver, persistence APIs, types, and the two internal readers', async () => {
    for (const code of [
      "import { resolveUserCorpAccess } from '@/composition/corp-access';",
      "import { updateAffiliations } from '@/platform/auth/affiliation-store';",
      "import type { CachedAffiliation } from '@/platform/auth/affiliation-store';",
    ]) {
      expect(await rail.messagesFor('src/composition/sync/example.ts', code, rule)).toEqual([]);
    }
    for (const path of ['src/composition/corp-access.ts', 'src/composition/map-access-projection.ts']) {
      expect(await rail.messagesFor(path, "import { getUserAffiliations } from '@/platform/auth/affiliation-store';", rule)).toEqual([]);
    }
  });

  it('preserves existing vendor and network restrictions in access consumers', async () => {
    await rail.expectImportNonEmpty('src/composition/sync/example.ts', '@upstash/redis');
    const messages = await rail.messagesFor('src/composition/sync/example.ts', "fetch('/example');", 'no-restricted-syntax');
    expect(messages.length).toBeGreaterThan(0);
  });
});
