/** Shared helpers for Atlas gated-authoring probes (session 4.0.4.1.1). */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { calmAtlasCamera } from './window-helpers.mjs';

const execFileAsync = promisify(execFile);

/**
 * Blank-map id — ONLY for probes that require (and mutate) a blank map, i.e.
 * home and two-clients. Strictly `UX_BLANK_MAP_ID`: no fallback, so a
 * one-variable run fails those probes closed instead of letting a generic
 * probe seed the same map the blank probes depend on.
 */
export const blankMapId = () => process.env.UX_BLANK_MAP_ID ?? null;

export const blankMapRoute = () => {
  const mapId = blankMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

/** Populated/general map id for authoring probes that only need edit rights. */
export const authoringMapId = () => process.env.UX_MAP_ID ?? null;

export const authoringRoute = () => {
  const mapId = authoringMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

/** Dedicated one-shot map for the automatic-jump UX gate. */
export const automaticJumpMapId = () => process.env.UX_JUMP_MAP_ID ?? null;

export const automaticJumpRoute = () => {
  const mapId = automaticJumpMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

/**
 * Dedicated one-shot map for the hidden-tab background-tracking probe
 * (4.0.4.2.3 SC-5). Like the jump map: disposable, seed a fresh empty map
 * per run.
 */
export const backgroundTrackingMapId = () => process.env.UX_BG_MAP_ID ?? null;

export const backgroundTrackingRoute = () => {
  const mapId = backgroundTrackingMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

/** Wait until the chain host has answered access for an editor. */
export async function waitForEditableMap(page, { timeout = 60_000 } = {}) {
  await page.waitForFunction(
    () => document.querySelector('[data-map-can-edit="true"]') !== null,
    null,
    { timeout },
  );
}

/**
 * Pick a system from a TerminalSearch field by typed name.
 * Prefers a highlighted suggestion when the listbox opens; otherwise submits
 * via the shared parse path (Enter), which resolves against the same index.
 */
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

/**
 * Right-click the first visible chain node and open Add connection….
 * Returns the click point (node center) so callers can assert the menu
 * actually anchored at the pointer rather than anywhere on screen.
 */
export async function openAddConnectionMenu(page) {
  const node = page.locator('[data-chain-node]').first();
  await node.waitFor({ state: 'visible', timeout: 60_000 });
  // Scroll first: click() may scroll the node, which would stale a box
  // captured before the gesture.
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

/** Turn off camera flights that can park an edge-anchored card off-screen. */
export async function calmMapCamera(page) {
  await calmAtlasCamera(page);
}

/**
 * Click the first connection edge. React Flow edge `<g>` groups are often
 * reported as hidden by Playwright even when painted, so click by geometry
 * (path preferred) rather than a visibility wait.
 */
export async function clickFirstEdge(page) {
  await calmMapCamera(page);
  const path = page.locator('.react-flow__edge .react-flow__edge-path').first();
  await path.waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(400);
  const box = await path.boundingBox();
  if (box === null) throw new Error('edge path has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const card = page.locator('[data-map-window="connection-details"]');
  await card.waitFor({ state: 'attached', timeout: 15_000 });
  // Edge-anchored transform can leave the card partially outside; force-scroll.
  await card.evaluate((element) => {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

/** Tear down every projected Convex claim for a map (revocation demo). */
export async function teardownMapAccess(mapId) {
  const { stdout, stderr } = await execFileAsync(
    'pnpm',
    ['map:project-access', '--', 'teardown', mapId],
    { cwd: process.cwd(), env: process.env, timeout: 60_000 },
  );
  if (stderr.trim()) console.error(stderr.trim());
  return stdout.trim();
}

/** Re-project durable Neon access into Convex (restore after revocation). */
export async function restoreMapAccess(mapId) {
  const { stdout, stderr } = await execFileAsync(
    'pnpm',
    ['map:project-access', '--', 'project', mapId],
    { cwd: process.cwd(), env: process.env, timeout: 60_000 },
  );
  if (stderr.trim()) console.error(stderr.trim());
  return stdout.trim();
}

/** Run an internal Convex fixture mutation via the CLI. */
export async function convexRun(path, args) {
  const { stdout, stderr } = await execFileAsync(
    'pnpm',
    ['exec', 'convex', 'run', path, JSON.stringify(args), '--deployment', 'local'],
    { cwd: process.cwd(), env: process.env, timeout: 30_000 },
  );
  if (stderr.trim()) console.error(stderr.trim());
  return stdout.trim();
}

/** Jita → Perimeter disposable jump used when a probe map has no edges yet. */
const DEFAULT_JUMP_FROM_SYSTEM_ID = 30_000_142;
const DEFAULT_JUMP_TO_SYSTEM_ID = 30_000_144;

/**
 * Ensures the map has at least one rendered edge, seeding a disposable jump
 * fixture when the canvas is empty. Shared by connection/intelligence probes.
 */
export async function ensureJumpEdge(
  page,
  mapId,
  {
    fromSystemId = DEFAULT_JUMP_FROM_SYSTEM_ID,
    toSystemId = DEFAULT_JUMP_TO_SYSTEM_ID,
  } = {},
) {
  if ((await page.locator('.react-flow__edge').count()) > 0) return;
  await convexRun('mapFixtures:placeJumpFixture', {
    mapId,
    fromSystemId,
    toSystemId,
    wormholeTypeCode: null,
    massState: null,
    shipSize: null,
    eolAt: null,
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.react-flow__edge').length >= 1,
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(800);
}
