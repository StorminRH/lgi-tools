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

    const current = page.getByRole('button', { name: /Use current system|Start tracking/ });
    check('current-system or start-tracking option is visible', await current.isVisible());
    const copy = (await prompt.textContent()) ?? '';
    check('stale tracking annotation is gone', !copy.includes('Requires live tracking'));
    check('no 4.0.4.2 placeholder remains', !copy.includes('4.0.4.2'));
    check('eyebrow copy is gone', !copy.includes('Atlas · new map'));
    check(
      'no chain nodes exist on the blank map',
      (await page.locator('[data-chain-node]').count()) === 0,
    );

    await shot('home-prompt');
  },
};
