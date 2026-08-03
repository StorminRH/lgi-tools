import {
  atlasWindowRoute,
  exerciseWindowInput,
  mapWindow,
  openSummary,
  settleMapViewport,
  waitForWindowMap,
} from '../lib/window-helpers.mjs';

const isolated = (result) =>
  result.before === result.after && result.value.includes('window keys');

export default {
  name: 'atlas-window-isolation',
  route: atlasWindowRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 2000,
  async run({ page, check, shot }) {
    if (!process.env.UX_MAP_ID) {
      check('UX_MAP_ID is set for the live map under test', false);
      return;
    }
    await page.evaluate(() => localStorage.removeItem('lgi:map:windows:v1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForWindowMap(page);
    const docked = await exerciseWindowInput(page, 'dock');
    check('typing and scrolling in the dock leave the viewport untouched', isolated(docked));

    const dock = mapWindow(page, 'dock');
    await dock.getByRole('button', { name: /Pop out Current system/ }).click();
    await settleMapViewport(page);
    const floating = await exerciseWindowInput(page, 'dock');
    check('typing and scrolling in the floating window leave the viewport untouched', isolated(floating));

    const node = await openSummary(page);
    check('a non-root node is available for the card isolation pass', node !== null);
    if (node !== null) {
      await settleMapViewport(page);
      const summary = await exerciseWindowInput(page, 'summary');
      check('typing and scrolling in the summary card leave the viewport untouched', isolated(summary));
    }
    await shot('isolated-window-input');
  },
};
