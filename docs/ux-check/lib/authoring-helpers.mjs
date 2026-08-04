/** Shared helpers for Atlas gated-authoring probes (session 4.0.4.1.1). */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Blank-map id for home / two-client authoring probes. */
export const authoringMapId = () =>
  process.env.UX_BLANK_MAP_ID ?? process.env.UX_MAP_ID ?? null;

export const authoringRoute = () => {
  const mapId = authoringMapId();
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

/** Right-click the first visible chain node and open Add connection…. */
export async function openAddConnectionMenu(page) {
  const node = page.locator('[data-chain-node]').first();
  await node.waitFor({ state: 'visible', timeout: 60_000 });
  await node.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add connection…' }).waitFor({
    state: 'visible',
    timeout: 10_000,
  });
}

/** Turn off camera flights that can park an edge-anchored card off-screen. */
export async function calmMapCamera(page) {
  for (const name of ['Camera follow', 'Click focus']) {
    const control = page.getByRole('switch', { name });
    if ((await control.count()) > 0 && (await control.isChecked())) {
      await control.click();
    }
  }
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
    ['exec', 'convex', 'run', path, JSON.stringify(args)],
    { cwd: process.cwd(), env: process.env, timeout: 30_000 },
  );
  if (stderr.trim()) console.error(stderr.trim());
  return stdout.trim();
}
