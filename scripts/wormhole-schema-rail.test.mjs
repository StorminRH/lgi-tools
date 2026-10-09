import { expect, test } from 'vitest';
import { createEslintRail } from './__tests__/eslint-rail.mjs';

const { messagesFor, expectImportHas, expectImportEmpty } = createEslintRail(import.meta.url);

const COMPONENT_PROBE = 'src/features/wormhole-sites/components/schema-rail-probe.tsx';
const MODULE_PROBE = 'src/features/wormhole-sites/schema-rail-probe.ts';
const SCHEMA_RAIL = 'site-taxonomy';

test('client-reachable wormhole-site modules may type-import the schema but not load Drizzle', async () => {
  await expectImportHas(COMPONENT_PROBE, '../schema', SCHEMA_RAIL);
  await expectImportHas(COMPONENT_PROBE, '@/features/wormhole-sites/schema', SCHEMA_RAIL);
  await expectImportHas(COMPONENT_PROBE, 'drizzle-orm/pg-core', SCHEMA_RAIL);
  await expectImportHas(MODULE_PROBE, './schema', SCHEMA_RAIL);
  await expectImportHas(MODULE_PROBE, 'drizzle-orm', SCHEMA_RAIL);

  expect(
    await messagesFor(
      COMPONENT_PROBE,
      "import type { sites } from '../schema';\n",
      'no-restricted-imports',
    ),
  ).toEqual([]);
  expect(
    await messagesFor(
      MODULE_PROBE,
      "import { type sites } from './schema';\n",
      'no-restricted-imports',
    ),
  ).toEqual([]);
  await expectImportEmpty(COMPONENT_PROBE, '../site-taxonomy');
  await expectImportEmpty(COMPONENT_PROBE, '../sleeper-classes');
});

test('the schema and its query module keep their Drizzle imports', async () => {
  await expectImportEmpty('src/features/wormhole-sites/schema.ts', 'drizzle-orm/pg-core');
  await expectImportEmpty('src/features/wormhole-sites/queries.ts', './schema');
  await expectImportEmpty('src/features/wormhole-sites/queries.ts', 'drizzle-orm');
  await expectImportEmpty('src/features/wormhole-sites/queries.test.ts', './schema');
});

test('the wormhole-site blocks keep the rails they re-list', async () => {
  await expectImportHas(COMPONENT_PROBE, '@/db', 'server roots');
  await expectImportHas(COMPONENT_PROBE, '@xyflow/react', 'React Flow');
  await expectImportHas(COMPONENT_PROBE, 'sonner', 'sonner');
  await expectImportHas(MODULE_PROBE, '@xyflow/react', 'React Flow');
  await expectImportHas(MODULE_PROBE, '@base-ui/react/dialog', 'Base UI');
  await expectImportEmpty('src/features/wormhole-sites/dev-sample.ts', '@/lib/env');
});
