import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createDbTestHarness, probeHarnessDatabase } from '@/db/__tests__/support/db-test-harness';

const schema = 'test_e2e_auth_seed';
const { baseUrl } = await probeHarnessDatabase();
const harness = await createDbTestHarness({
  schema,
  tables: ['user', 'account', 'session', 'characters', 'maps', 'map_access'],
  foreignKeys: [
    { table: 'account', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'session', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
  ],
});
const execFileAsync = promisify(execFile);

describe.skipIf(!harness.reachable)('E2E seed CLI (real Postgres)', () => {
  it.each(['BETTER_AUTH_SECRET', 'SESSION_SECRET'])(
    'loads dotenv-only %s before minting a cookie that a fresh app process accepts',
    async (secretName) => {
      const directory = await mkdtemp(path.join(tmpdir(), 'lgi-auth-seed-'));
      try {
        const envFile = path.join(directory, '.env.local');
        const storageFile = path.join(directory, 'storage.json');
        const resultFile = path.join(directory, 'session.json');
        const databaseUrl = new URL(baseUrl);
        databaseUrl.searchParams.set('search_path', schema);
        await writeFile(
          envFile,
          [
            `${secretName}=dotenv-only-seed-regression-secret-32chars`,
            'BETTER_AUTH_URL=http://localhost:3000',
            `DATABASE_URL=${databaseUrl.href}`,
            'LOCAL_DB_DRIVER=postgres-js',
            'NEXT_PUBLIC_CONVEX_URL=',
          ].join('\n'),
        );
        const childEnv: NodeJS.ProcessEnv = {
          PATH: process.env.PATH,
          NODE_ENV: 'development',
          DOTENV_PATH: envFile,
        };
        const nodeArgs = ['--import', 'tsx', '--conditions=react-server'];
        await execFileAsync(
          process.execPath,
          [...nodeArgs, 'e2e/seed-storage-state.ts', `--out=${storageFile}`],
          { cwd: process.cwd(), env: childEnv, timeout: 30_000 },
        );
        await execFileAsync(
          process.execPath,
          [
            ...nodeArgs,
            '--input-type=module',
            '--eval',
            `
              import { config } from 'dotenv';
              import { readFile, writeFile } from 'node:fs/promises';
              import { createRequire } from 'node:module';
              config({ path: process.env.DOTENV_PATH });
              const { auth } = createRequire(import.meta.url)('./src/composition/auth.ts');
              const storage = JSON.parse(await readFile(${JSON.stringify(storageFile)}, 'utf8'));
              const cookie = storage.cookies.map(({ name, value }) => name + '=' + value).join('; ');
              const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
              await writeFile(${JSON.stringify(resultFile)}, JSON.stringify({
                userId: session?.user.id,
                characterId: session?.characterId,
                role: session?.role,
              }));
              process.exit(0);
            `,
          ],
          { cwd: process.cwd(), env: childEnv, timeout: 30_000 },
        );
        expect(JSON.parse(await readFile(resultFile, 'utf8'))).toEqual({
          userId: 'e2e-pilot',
          characterId: 9_000_001,
          role: 'USER',
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    65_000,
  );
});
