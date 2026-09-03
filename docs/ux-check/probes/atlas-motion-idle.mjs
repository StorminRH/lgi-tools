import {
  installMotionMetrics,
  readRafCount,
} from '../lib/motion-metrics.mjs';

export default {
  name: 'atlas-motion-idle',
  route: process.env.UX_MAP_ID ? `/atlas?map=${process.env.UX_MAP_ID}` : '/atlas',
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 2500,
  async setup({ page }) {
    await installMotionMetrics(page);
  },
  async run({ page, check, shot }) {
    const mapId = process.env.UX_MAP_ID;
    if (!mapId) {
      check('UX_MAP_ID is set for the live map under test', false);
      return;
    }

    await page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 1,
      null,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(1600);

    await page.getByText('Layout dials').click();
    const beforeGlide = await readRafCount(page);
    await page.getByRole('button', { name: 'Increase Ring spacing' }).click();
    await page.waitForTimeout(2000);
    const afterGlide = await readRafCount(page);
    check(
      `positive control: the glide registered frames (${afterGlide - beforeGlide} registrations)`,
      afterGlide > beforeGlide,
    );

    const disc = page.locator('.map-node-disc').first();
    await disc.hover();
    await page.waitForTimeout(150);
    const hoveredAnimation = await disc.evaluate(
      (element) => getComputedStyle(element).animationName,
    );
    check(
      'hovering runs the breathing animation on the disc',
      hoveredAnimation.includes('map-node-breathe'),
    );
    await page.mouse.move(4, 4);
    await page.waitForTimeout(150);
    const restingAnimation = await disc.evaluate(
      (element) => getComputedStyle(element).animationName,
    );
    check(
      'the response reverts on pointer-out',
      !restingAnimation.includes('map-node-breathe'),
    );

    await page.waitForTimeout(1500);
    const idleStart = await readRafCount(page);
    await page.waitForTimeout(3200);
    const idleEnd = await readRafCount(page);
    check(
      `the idle map registers zero animation frames across ${(3.2).toFixed(1)} s (${idleEnd - idleStart} registrations)`,
      idleEnd === idleStart,
    );

    await shot('idle');
  },
};
