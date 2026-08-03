export const WINDOW_STORAGE_KEY = 'lgi:map:windows:v1';

export const atlasWindowRoute = () =>
  process.env.UX_MAP_ID ? `/atlas?map=${process.env.UX_MAP_ID}` : '/atlas';

export async function waitForWindowMap(page, minimumNodes = 2) {
  await page.waitForFunction(
    (minimum) =>
      document.querySelectorAll('[data-chain-node]').length >= minimum
      && document.querySelector('[data-map-window="dock"]') !== null,
    minimumNodes,
    { timeout: 60_000 },
  );
}

export const viewportTransform = (page) =>
  page.locator('.react-flow__viewport').evaluate((element) => element.style.transform);

export async function exposedPanePoint(page) {
  const pane = page.locator('.react-flow__pane');
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
          if (hit?.closest('.react-flow__pane')) return point;
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

export async function hittableNode(page, startIndex = 0) {
  const nodes = page.locator('.react-flow__node');
  for (let index = startIndex; index < (await nodes.count()); index += 1) {
    const candidate = nodes.nth(index);
    const box = await candidate.boundingBox();
    if (box === null) continue;
    const point = { x: box.x + box.width / 2, y: box.y + 22 };
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('.react-flow__node') !== null,
      point,
    );
    if (hit) return { node: candidate, point, index };
  }
  return null;
}

export async function openSummary(page) {
  const target = await hittableNode(page, 1);
  if (target === null) return null;
  await page.mouse.click(target.point.x, target.point.y);
  await page.locator('[data-map-window="summary"]').waitFor({ state: 'visible' });
  return target.node;
}

export async function exerciseWindowInput(page, windowId) {
  const root = page.locator(`[data-map-window="${windowId}"]`);
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
