export async function openAtlasMenu(page) {

  await page.locator('[data-account-menu-trigger]').filter({ visible: true }).click();
  const popup = page.locator('[data-account-menu-popup]').filter({ visible: true });
  await popup.waitFor({ state: 'visible', timeout: 10_000 });
  return popup;
}

export async function closeAtlasMenu(page) {
  await page.keyboard.press('Escape');
  await page
    .locator('[data-account-menu-popup]')
    .waitFor({ state: 'hidden', timeout: 10_000 });
}

export async function setAtlasMapPreference(page, name, desired) {
  const popup = await openAtlasMenu(page);
  const control = popup.getByRole('switch', { name });
  await control.waitFor({ state: 'visible', timeout: 10_000 });
  if ((await control.isChecked()) !== desired) await control.click();
  const result = await control.isChecked();
  await closeAtlasMenu(page);
  return result;
}

export async function calmAtlasCamera(page) {
  const homePrompt = page.locator('[data-map-home-prompt]');
  if (await homePrompt.isVisible().catch(() => false)) {
    const input = homePrompt.getByPlaceholder(/Search systems/i);
    await input.click();
    await input.fill('J113551');
    await input.press('Enter');
    await homePrompt.waitFor({ state: 'hidden', timeout: 15_000 });
  }
  const popup = await openAtlasMenu(page);
  for (const name of ['camera follow', 'click focus']) {
    const control = popup.getByRole('switch', { name });
    await control.waitFor({ state: 'visible', timeout: 10_000 });
    if (await control.isChecked()) await control.click();
  }
  await closeAtlasMenu(page);
}

export const atlasWindowRoute = () =>
  process.env.UX_MAP_ID ? `/atlas?map=${process.env.UX_MAP_ID}` : '/atlas';

export const mapCanvas = (page) =>
  page.locator('[data-map-canvas]').filter({ visible: true });

export const flowWrapper = (page) =>
  mapCanvas(page).locator('[data-testid="rf__wrapper"]');

export const flowPane = (page) => flowWrapper(page).locator('.react-flow__pane');

export const flowViewport = (page) =>
  flowWrapper(page).locator('.react-flow__viewport');

export const mapWindow = (page, windowId) =>
  page.locator(`[data-map-window="${windowId}"]`).filter({ visible: true });

export async function waitForWindowMap(page, minimumNodes = 2) {
  await page.waitForFunction(
    (minimum) => {
      const canvases = [...document.querySelectorAll('[data-map-canvas]')].filter(
        (element) => element.checkVisibility?.() !== false && element.getClientRects().length > 0,
      );
      if (canvases.length !== 1) return false;
      const canvas = canvases[0];
      const nodes = canvas.querySelectorAll('[data-testid="rf__wrapper"] .react-flow__node');
      const dock = [...document.querySelectorAll('[data-map-window="dock"]')].some(
        (element) => element.checkVisibility?.() !== false && element.getClientRects().length > 0,
      );
      return nodes.length >= minimum && dock;
    },
    minimumNodes,
    { timeout: 60_000 },
  );

  await calmAtlasCamera(page);
  await settleMapViewport(page);
}

export const viewportTransform = (page) =>
  flowViewport(page).evaluate((element) => element.style.transform);

export async function settleMapViewport(page, { samples = 4, intervalMs = 150 } = {}) {
  let last = await viewportTransform(page);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(intervalMs);
    const next = await viewportTransform(page);
    if (next === last) {
      let stable = true;
      for (let sample = 1; sample < samples; sample += 1) {
        await page.waitForTimeout(intervalMs);
        if ((await viewportTransform(page)) !== last) {
          stable = false;
          break;
        }
      }
      if (stable) return last;
    }
    last = next;
  }
  return last;
}

function pointInViewport(page, point) {
  const size = page.viewportSize();
  if (size === null) return false;
  return point.x >= 0 && point.y >= 0 && point.x < size.width && point.y < size.height;
}

export async function exposedPanePoint(page) {
  const pane = flowPane(page);
  const box = await pane.boundingBox();
  if (box === null) return null;
  return page.evaluate(
    ({ x, y, width, height }) => {
      for (let row = 1; row <= 7; row += 1) {
        for (let column = 1; column <= 9; column += 1) {
          const point = {
            x: x + (width * column) / 10,
            y: y + (height * row) / 8,
          };
          const hit = document.elementFromPoint(point.x, point.y);
          if (hit?.closest('[data-map-canvas] .react-flow__pane')) return point;
        }
      }
      return null;
    },
    box,
  );
}

export async function clickExposedPane(page) {
  const point = await exposedPanePoint(page);
  if (point === null) return false;
  await page.mouse.click(point.x, point.y);
  return true;
}

export async function hittableNode(page, { excludeIds = [] } = {}) {
  const excluded = new Set(excludeIds.map(String));
  const discs = flowWrapper(page).locator('.map-node-disc');
  const count = await discs.count();
  for (let index = 0; index < count; index += 1) {
    const disc = discs.nth(index);
    const box = await disc.boundingBox();
    if (box === null) continue;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (!pointInViewport(page, point)) continue;
    const hit = await page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        const node = element?.closest('.react-flow__node');
        return node
          ? { id: node.getAttribute('data-id'), ok: true }
          : { id: null, ok: false };
      },
      point,
    );
    if (!hit.ok || hit.id === null || excluded.has(hit.id)) continue;
    return {
      node: flowWrapper(page).locator(`.react-flow__node[data-id="${hit.id}"]`),
      disc,
      point,
      id: hit.id,
      index,
    };
  }
  return null;
}

export async function rootSystemTarget(page) {
  const dock = mapWindow(page, 'dock');

  const title = ((await dock.locator('h2').textContent()) ?? '').trim();
  const name = title.replace(/^Current system\s*·\s*/i, '').trim();
  if (name.length === 0) return null;
  const nodes = flowWrapper(page).locator('.react-flow__node');
  const count = await nodes.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = nodes.nth(index);
    const nodeName = ((await candidate.locator('.text-name').textContent()) ?? '').trim();
    if (nodeName !== name) continue;
    const id = await candidate.getAttribute('data-id');
    if (id === null) continue;
    return { node: candidate, id };
  }
  return null;
}

export async function openSummary(page) {
  const root = await rootSystemTarget(page);
  const target = await hittableNode(page, {
    excludeIds: root ? [root.id] : [],
  });
  if (target === null) return null;
  await page.mouse.click(target.point.x, target.point.y);
  await mapWindow(page, 'summary').waitFor({ state: 'visible' });
  return target;
}

export async function dragNodeDisc(page, target, delta = { x: 70, y: 40 }) {
  await setAtlasMapPreference(page, 'auto layout', false);
  const box = await target.disc.boundingBox();
  if (box === null) return false;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 8 });
  await page.mouse.up();
  return true;
}

export async function exerciseWindowInput(page, windowId) {
  const root = mapWindow(page, windowId);
  const before = await viewportTransform(page);
  const input = root.locator('[data-window-probe-input]');
  await root.locator('[data-map-window-scroll]').evaluate((element) => {
    const existing = element.querySelector('[data-window-probe-input]');
    if (existing) existing.remove();
    const field = document.createElement('input');
    field.dataset.windowProbeInput = '';
    field.setAttribute('aria-label', 'Window isolation probe');
    element.prepend(field);
  });
  await input.fill('window keys');
  await input.press('Space');
  await input.press('Shift+A');
  await input.press('Control+B');
  const box = await root.boundingBox();
  if (box !== null) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 240);
  }
  await page.waitForTimeout(100);
  return {
    before,
    after: await viewportTransform(page),
    value: await input.inputValue(),
  };
}
