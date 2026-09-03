import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config as loadDotenv } from 'dotenv';
import { calmAtlasCamera } from './window-helpers.mjs';

loadDotenv({ path: process.env.DOTENV_PATH ?? '.env.local' });

const execFileAsync = promisify(execFile);

export const blankMapId = () => process.env.UX_BLANK_MAP_ID ?? null;

export const blankMapRoute = () => {
  const mapId = blankMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

export const authoringMapId = () => process.env.UX_MAP_ID ?? null;

export const authoringRoute = () => {
  const mapId = authoringMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

export const automaticJumpMapId = () => process.env.UX_JUMP_MAP_ID ?? null;

export const automaticJumpRoute = () => {
  const mapId = automaticJumpMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

export const backgroundTrackingMapId = () => process.env.UX_BG_MAP_ID ?? null;

export const backgroundTrackingRoute = () => {
  const mapId = backgroundTrackingMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

export const haloMapId = () => process.env.UX_HALO_MAP_ID ?? null;

export const haloRoute = () => {
  const mapId = haloMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

export const fogMapId = () => process.env.UX_FOG_MAP_ID ?? null;

export const fogRoute = () => {
  const mapId = fogMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

export const fogBudgetMapId = () => process.env.UX_FOG_BUDGET_MAP_ID ?? null;

export const fogBudgetRoute = () => {
  const mapId = fogBudgetMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

export const signatureLifecycleMapId = () => process.env.UX_SIG_MAP_ID ?? null;

export const signatureLifecycleRoute = () => {
  const mapId = signatureLifecycleMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

export const signatureViewerMapId = () =>
  process.env.UX_SITE_VIEWER_MAP_ID ?? null;

export const signatureViewerRoute = () => {
  const mapId = signatureViewerMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

export async function waitForEditableMap(page, { timeout = 60_000 } = {}) {
  await page.waitForFunction(
    () => document.querySelector('[data-map-can-edit="true"]') !== null,
    null,
    { timeout },
  );
}

export async function pickSystemSearch(page, placeholder, query, { root } = {}) {
  const scope = root ?? page;
  const input = scope.getByPlaceholder(placeholder).first();
  await input.click();
  await input.fill(query);
  await page.waitForTimeout(900);
  const optionCount = await page.getByRole('option').count();
  if (optionCount > 0) {
    await input.press('ArrowDown');
    await page.waitForTimeout(200);
  }
  await input.press('Enter');
  await page.waitForTimeout(900);
}

export async function openAddConnectionMenu(page) {
  const node = page.locator('[data-chain-node]').first();
  await node.waitFor({ state: 'visible', timeout: 60_000 });
  await node.scrollIntoViewIfNeeded();
  const box = await node.boundingBox();
  await node.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add connection…' }).waitFor({
    state: 'visible',
    timeout: 10_000,
  });
  return box === null
    ? null
    : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function calmMapCamera(page) {
  await calmAtlasCamera(page);
}

export function signatureEditor(page) {
  return page.locator('[data-map-window="signature-editor"]');
}

export async function openFirstEdgeEditor(page) {
  await calmMapCamera(page);
  const path = page.locator('.react-flow__edge .react-flow__edge-path').first();
  await path.waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(400);
  const box = await path.boundingBox();
  if (box === null) throw new Error('edge path has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
    button: 'right',
  });
  await page
    .locator('[data-map-edge-menu]')
    .waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await signatureEditor(page).waitFor({ state: 'attached', timeout: 15_000 });
}

export async function teardownMapAccess(mapId) {
  const { stdout, stderr } = await execFileAsync(
    'pnpm',
    ['map:project-access', '--', 'teardown', mapId],
    { cwd: process.cwd(), env: process.env, timeout: 60_000 },
  );
  if (stderr.trim()) console.error(stderr.trim());
  return stdout.trim();
}

export async function restoreMapAccess(mapId) {
  const { stdout, stderr } = await execFileAsync(
    'pnpm',
    ['map:project-access', '--', 'project', mapId],
    { cwd: process.cwd(), env: process.env, timeout: 60_000 },
  );
  if (stderr.trim()) console.error(stderr.trim());
  return stdout.trim();
}

export async function convexRun(path, args) {
  const deployment = process.env.CONVEX_DEPLOYMENT ?? '';
  if (
    !deployment.startsWith('local:') &&
    !deployment.startsWith('anonymous:')
  ) {
    throw new Error(
      `Refusing convex run: CONVEX_DEPLOYMENT=${deployment || '(unset)'} is not a local or anonymous backend`,
    );
  }
  const { stdout, stderr } = await execFileAsync(
    'pnpm',
    ['exec', 'convex', 'run', path, JSON.stringify(args)],
    { cwd: process.cwd(), env: process.env, timeout: 30_000 },
  );
  if (stderr.trim()) console.error(stderr.trim());
  return stdout.trim();
}

const DEFAULT_JUMP_FROM_SYSTEM_ID = 30_000_142;
const DEFAULT_JUMP_TO_SYSTEM_ID = 30_000_144;

export async function ensureJumpEdge(
  page,
  mapId,
  {
    fromSystemId = DEFAULT_JUMP_FROM_SYSTEM_ID,
    toSystemId = DEFAULT_JUMP_TO_SYSTEM_ID,
  } = {},
) {
  if ((await page.locator('.react-flow__edge').count()) > 0) return;
  await convexRun('mapFixturePlace:placeJumpFixture', {
    mapId,
    fromSystemId,
    toSystemId,
    wormholeTypeCode: null,
    massState: null,
    shipSize: null,
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.react-flow__edge').length >= 1,
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(800);
}
