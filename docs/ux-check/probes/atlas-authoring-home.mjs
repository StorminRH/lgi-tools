// SC-1.1 / SC-6.1: editor on a blank map sees the centered home prompt with
// both options; tracking option stays disabled. Requires auth + blank map id.
import {
  blankMapId,
  blankMapRoute,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

export default {
  name: 'atlas-authoring-home',
  route: blankMapRoute(),
  viewports: ['desktop', 'mobile'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2000,
  async run({ page, check, shot }) {
    if (!blankMapId()) {
      check('UX_BLANK_MAP_ID is set for the blank map', false);
      return;
    }

    await waitForEditableMap(page);
    const prompt = page.locator('[data-map-home-prompt]');
    await prompt.waitFor({ state: 'visible', timeout: 60_000 });

    check('home prompt is visible for an editor on an empty map', await prompt.isVisible());
    check(
      'home title asks to set the home system',
      (await page.getByRole('heading', { name: 'Set your home system' }).count()) === 1,
    );
    check(
      'system search option is present',
      (await page.getByPlaceholder('Search systems — type a name').count()) === 1,
    );

    const tracking = page.locator('[data-map-home-current-disabled]');
    check('Use current system option is visible', await tracking.isVisible());
    check('Use current system option is disabled', await tracking.isDisabled());
    check(
      'tracking annotation points at 4.0.4.2',
      (await tracking.textContent())?.includes('Requires live tracking') === true,
    );
    check(
      'no chain nodes exist on the blank map',
      (await page.locator('[data-chain-node]').count()) === 0,
    );

    await shot('home-prompt');
  },
};
