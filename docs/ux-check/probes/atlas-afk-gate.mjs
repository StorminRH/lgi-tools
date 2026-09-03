import { blankMapId, blankMapRoute } from '../lib/authoring-helpers.mjs';

async function setVisibility(page, state) {
  await page.evaluate((next) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => next,
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => next === 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

export default {
  name: 'atlas-afk-gate',
  route: blankMapRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 2500,
  async setup({ page }) {

    await page.clock.install();
  },
  async run({ page, check, shot }) {
    if (!blankMapId()) {
      check('UX_BLANK_MAP_ID is set for the AFK gate probe', false);
      return;
    }

    await page.waitForFunction(
      () => document.querySelector('[data-map-shell]') !== null,
      null,
      { timeout: 60_000 },
    );
    check('no AFK dialog on an active map', (await page.getByRole('dialog').count()) === 0);

    await setVisibility(page, 'hidden');
    await page.clock.fastForward('01:01:00');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    check('prompt appears after an hour hidden', await dialog.isVisible().catch(() => false));
    const warnCopy = page.getByText('Tracking pauses in a few minutes', { exact: false });
    await warnCopy.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
    check('prompt warns before pausing', (await warnCopy.count()) > 0);
    await shot('afk-prompt');

    await page.clock.fastForward('00:06:00');

    const pausedCopy = page.getByText('location tracking is paused', { exact: false });
    await pausedCopy.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
    check('unanswered prompt flips to the paused copy', (await pausedCopy.count()) > 0);
    await shot('afk-paused');

    await setVisibility(page, 'visible');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(600);
    check('Continue dismisses the prompt', (await page.getByRole('dialog').count()) === 0);
  },
};
