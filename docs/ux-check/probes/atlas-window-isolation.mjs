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
    await waitForWindowMap(page);
    const docked = await exerciseWindowInput(page, 'dock');
    check(
      'typing and scrolling in the current-system readout leave the viewport untouched',
      isolated(docked),
    );
    check(
      'the readout stays docked (no floating mode)',
      (await mapWindow(page, 'dock').getAttribute('data-map-window-placement')) === 'docked',
    );

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
