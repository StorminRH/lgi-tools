/** Shared helpers for Atlas gated-authoring probes (session 4.0.4.1.1). */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config as loadDotenv } from 'dotenv';
import { calmAtlasCamera } from './window-helpers.mjs';

// Fill CONVEX_DEPLOYMENT from `.env.local` without overriding an explicit
// ambient value. Probe runners do not load dotenv themselves.
loadDotenv({ path: process.env.DOTENV_PATH ?? '.env.local' });

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

/**
 * Dedicated one-shot map for the k-space halo probe (4.0.4.2.3 SC-2/SC-4).
 * Disposable like the jump map: seed a fresh empty map per run — the probe
 * leaves its authored anchor and one authored jump behind.
 */
export const haloMapId = () => process.env.UX_HALO_MAP_ID ?? null;

export const haloRoute = () => {
  const mapId = haloMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

/**
 * Dedicated one-shot map for the fog layering probe (4.0.4.2.3 SC-3.2).
 * Disposable: seed a fresh empty map per run — the probe leaves one authored
 * anchor behind.
 */
export const fogMapId = () => process.env.UX_FOG_MAP_ID ?? null;

export const fogRoute = () => {
  const mapId = fogMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

/**
 * Dedicated one-shot map for the fog+halo frame-budget probe (4.0.4.2.3
 * SC-6.2). Disposable: the probe seeds a ceiling-sized chain (~55 systems)
 * into it, so never point it at a map you care about.
 */
export const fogBudgetMapId = () => process.env.UX_FOG_BUDGET_MAP_ID ?? null;

export const fogBudgetRoute = () => {
  const mapId = fogBudgetMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

/**
 * Dedicated one-shot map for the signature-lifecycle UX gate (4.0.4.3.1 G-1).
 * Disposable like the jump map: seed a fresh empty map per run — the probe
 * leaves its pasted signatures, authored jump, and collapse ledger behind.
 */
export const signatureLifecycleMapId = () => process.env.UX_SIG_MAP_ID ?? null;

export const signatureLifecycleRoute = () => {
  const mapId = signatureLifecycleMapId();
  return mapId ? `/atlas?map=${mapId}` : '/atlas';
};

/**
 * Dedicated one-shot map for the signature site-viewer UX gate (4.0.4.3.3 G-1).
 * Disposable: seed a fresh empty map per run — the probe leaves a pasted
 * catalogue site row and any opened viewer state behind.
 */
export const signatureViewerMapId = () =>
  process.env.UX_SITE_VIEWER_MAP_ID ?? null;

export const signatureViewerRoute = () => {
  const mapId = signatureViewerMapId();
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

/** The Signature Editor pop-out parked beside the scanner dock. */
export function signatureEditor(page) {
  return page.locator('[data-map-window="signature-editor"]');
}

/**
 * Right-click the first connection edge and pick Edit, opening the map's one
 * Signature Editor. React Flow edge `<g>` groups are often reported as hidden
 * by Playwright even when painted, so click by geometry (path preferred)
 * rather than a visibility wait.
 */
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

/**
 * Run an internal Convex fixture mutation via the CLI.
 *
 * Uses the deployment selected in `.env.local`. `--deployment local` 401s on
 * anonymous Cloud Agent backends (`anonymous:…`) because it resolves through
 * api.convex.dev. Fail closed if CONVEX_DEPLOYMENT is missing or hosted.
 */
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
  await convexRun('mapFixturePlace:placeJumpFixture', {
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
