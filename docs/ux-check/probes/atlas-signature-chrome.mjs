import {
  atlasWindowRoute,
  mapWindow,
  waitForWindowMap,
} from '../lib/window-helpers.mjs';

export default {
  name: 'atlas-signature-chrome',
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

    const signatures = mapWindow(page, 'signatures');
    check('the scanner window is visible', await signatures.isVisible());
    check(
      'the scanner window uses the one bottom-left MapWindow placement',
      (await signatures.getAttribute('data-map-window-placement')) ===
        'docked-bottom-left',
    );
    const signatureBox = await signatures.boundingBox();
    const viewport = page.viewportSize();
    check(
      'the scanner window occupies the lower-left quadrant',
      signatureBox !== null && viewport !== null
        && signatureBox.x < viewport.width / 2
        && signatureBox.y + signatureBox.height > viewport.height / 2,
    );

    const dock = mapWindow(page, 'dock');
    check(
      'the dock carries the one identity readout (D-E) and scanner summary',
      (await dock.locator('[data-identity-readout]').count()) === 1
        && (await dock.locator('[data-security-status]').count()) === 0
        && (await dock.locator('[data-intel-section="signatures"]').count()) === 1,
    );

    const feedback = page.locator('[data-map-feedback-chip]');
    const ledger = page.locator('[data-map-event-log]');
    check('the map feedback chip is visible', await feedback.isVisible());
    check('the audit chip is visible', await ledger.isVisible());
    const feedbackBox = await feedback.boundingBox();
    const ledgerBox = await ledger.boundingBox();
    check(
      'feedback and audit form the bottom-right chip rail',
      viewport !== null && feedbackBox !== null && ledgerBox !== null
        && feedbackBox.x > viewport.width / 2
        && ledgerBox.x > viewport.width / 2
        && Math.abs(
          feedbackBox.y + feedbackBox.height - (ledgerBox.y + ledgerBox.height),
        ) < 12,
    );

    const dials = page.locator('[data-map-dev-dials]');
    if (await dials.count()) {
      const dialBox = await dials.boundingBox();
      check(
        'development dials join the right-side chrome cluster',
        viewport !== null && dialBox !== null && dialBox.x > viewport.width / 2,
      );
    } else {
      check('dev dials are absent outside development (expected)', true);
    }

    await shot('signature-window-chrome-relayout');
  },
};
