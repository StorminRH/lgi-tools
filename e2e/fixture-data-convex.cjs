/* eslint-disable @typescript-eslint/no-require-imports -- Playwright CJS fixtures cannot statically import .mjs; this helper stays native CommonJS. */
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createRequire } = require('node:module');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { requireLocalConvexEnvironment } = require('./fixture-data-local.cjs');

const execFileAsync = promisify(execFile);
const requireConvex = createRequire(__filename);

function requireSupportedConvexCleanup() {
  const installed = requireConvex('convex/package.json');
  if (installed.version !== '1.45.0') {
    throw new Error('E2E_PREREQUISITE: reverify the internal Convex cleanup contract for this installed version');
  }
}

async function localConvexCommand(args) {
  requireLocalConvexEnvironment();
  requireSupportedConvexCleanup();
  const directory = await mkdtemp(path.join(tmpdir(), 'lgi-e2e-convex-'));
  const envFile = path.join(directory, 'selection.env');
  try {
    await writeFile(envFile, `CONVEX_DEPLOYMENT=${process.env.CONVEX_DEPLOYMENT}\n`, { mode: 0o600 });
    const { stdout } = await execFileAsync('pnpm', ['exec', '--', 'convex', 'run', ...args, '--env-file', envFile], {
      cwd: process.cwd(), env: { ...process.env, FORCE_COLOR: '0' },
      timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    throw new Error('E2E_PREREQUISITE: local Convex command failed; verify the running backend and deployed functions');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function localConvexRun(functionName, args) {
  const output = await localConvexCommand([functionName, JSON.stringify(args)]);
  return output ? JSON.parse(output) : null;
}

const MAP_TABLES = [
  'mapAccess', 'mapAccessProjectionWatermarks', 'mapSystems', 'mapConnections',
  'mapJumpBookkeeping', 'mapEvents', 'mapSignatures', 'mapNotes',
  'mapSignatureActivity', 'mapTracking',
];
const USER_TABLES = [
  'syncSubjects', 'syncPresence', 'characterOnline', 'characterLocation',
  'characterLocationOnline', 'characterLocationAccess', 'characterLocationCovered',
];

async function censusConvexFixtures({ mapIds, userIds }) {
  const source = `
    const mapIds = ${JSON.stringify(mapIds)};
    const userIds = ${JSON.stringify(userIds)};
    const result = [];
    for (const [tables, field, ids] of [
      [${JSON.stringify(MAP_TABLES)}, 'mapId', mapIds],
      [${JSON.stringify(USER_TABLES)}, 'userId', userIds],
    ]) {
      for (const table of tables) {
        for (const id of ids) {
          const rows = await ctx.db.query(table).filter(q => q.eq(q.field(field), id)).take(1001);
          if (rows.length > 1000) throw new Error('Fixture census exceeded its row bound');
          for (const row of rows) result.push({ table, id: row._id, ownerField: field, ownerId: id });
        }
      }
    }
    return result;
  `;
  return JSON.parse(await localConvexCommand(['--inline-query', source]));
}

async function drainBatches(run, functionName, args) {
  for (let batch = 0; batch < 100; batch += 1) {
    const result = await run(functionName, args);
    if (result === null || typeof result !== 'object' || typeof result.hasMore !== 'boolean') {
      throw new Error('E2E_CLEANUP: invalid purge response');
    }
    if (!result.hasMore) return;
  }
  throw new Error('E2E_CLEANUP: purge exhausted the fixture batch limit');
}

async function purgeConvexFixtures({ mapIds, userIds }, run = localConvexRun) {
  const errors = [];
  async function attempt(action) {
    try { await action(); } catch (error) { errors.push(error); }
  }
  for (const mapId of mapIds) {
    await attempt(() => drainBatches(run, 'mapPurge:purgeMapBatch', { mapId }));
  }
  for (const userId of userIds) {
    await attempt(() => run('characterLocationPurge:purgeForUser', { userId, characterId: null }));
    await attempt(() => run('onlineStatus:purgeForUser', { userId, characterId: null }));
    await attempt(() => drainBatches(run, 'mapAccessProjection:purgeUserClaims', { userId }));
  }
  if (errors.length > 0) throw new AggregateError(errors, 'E2E_CLEANUP: one or more owned-resource purges failed');
}

function ownedSyncDocuments({ rows, userIds }) {
  if (!Array.isArray(rows)) throw new Error('E2E_CLEANUP: invalid owned-row census');
  const owned = new Set(userIds);
  const documents = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object'
      || typeof row.id !== 'string' || typeof row.table !== 'string'
      || typeof row.ownerId !== 'string' || typeof row.ownerField !== 'string') {
      throw new Error('E2E_CLEANUP: invalid owned-row census entry');
    }
    if ((row.table === 'syncSubjects' || row.table === 'syncPresence')
      && row.ownerField === 'userId' && owned.has(row.ownerId)) {
      documents.push({ id: row.id, tableName: row.table });
    }
  }
  if (documents.length > 4096) throw new Error('E2E_CLEANUP: scoped deletion exceeds the verified Convex limit');
  return documents;
}

async function removeOwnedSyncRows(scope, run = localConvexRun) {
  const toDelete = ownedSyncDocuments(scope);
  if (toDelete.length === 0) return;
  const result = await run('_system/frontend/deleteDocuments', { componentId: null, toDelete });
  if (result === null || typeof result !== 'object' || result.success !== true) {
    throw new Error('E2E_CLEANUP: Convex did not confirm scoped sync-row deletion');
  }
}

module.exports = {
  requireSupportedConvexCleanup,
  localConvexCommand,
  localConvexRun,
  MAP_TABLES,
  USER_TABLES,
  censusConvexFixtures,
  purgeConvexFixtures,
  ownedSyncDocuments,
  removeOwnedSyncRows,
};
