// AFK gate (hidden-tab tracking): an hour continuously hidden raises the
// "Still mapping?" prompt, five unanswered minutes flip it to paused, and
// Continue resumes. Real thresholds are exercised through Playwright's
// virtual clock (fastForward fires due timers at most once — no heartbeat
// storm), and visibility is simulated with the standard own-property shadow
// over document.visibilityState. Requires authenticated storage state and
// UX_BLANK_MAP_ID (any accessible map mounts the gate; no tracked pilot
// needed — the AFK machine runs whenever the canvas is mounted).
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
    // Virtualize Date.now + timers before any app script runs; the clock
    // keeps flowing in real time until fastForward jumps it.
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

    // Alt-tab into the game: an hour passes hidden.
    await setVisibility(page, 'hidden');
    await page.clock.fastForward('01:01:00');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    check('prompt appears after an hour hidden', await dialog.isVisible().catch(() => false));
    check(
      'prompt warns before pausing',
      (await page.getByText('Tracking pauses in a few minutes', { exact: false }).count()) > 0,
    );
    await shot('afk-prompt');

    // Unanswered for the response window: tracking pauses, prompt persists.
    await page.clock.fastForward('00:06:00');
    check(
      'unanswered prompt flips to the paused copy',
      (await page.getByText('location tracking is paused', { exact: false }).count()) > 0,
    );
    await shot('afk-paused');

    // The player alt-tabs back: the prompt is waiting; Continue resumes.
    await setVisibility(page, 'visible');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(600);
    check('Continue dismisses the prompt', (await page.getByRole('dialog').count()) === 0);
  },
};
