import { test, expect } from './fixtures';
import inventory from './probe-registry.json';
const { journeys } = inventory;
import { selectJourneys } from './lane-policy.cjs';

const requested = (process.env.E2E_SCENARIOS ?? '').split(',').map(value => value.trim()).filter(Boolean);
const selected = selectJourneys({
  journeys, lane: process.env.E2E_LANE, scenarioIds: requested, list: process.argv.includes('--list'),
});

for (const journey of selected) {
  for (const viewport of journey.viewports) {
    test.describe(`${journey.id} ${viewport}`, () => {
      test.use({ probeAuthenticated: journey.authenticated, probeViewport: viewport });
      test(`[${journey.id}] ${viewport} @${journey.lane}`, async ({ probe }, testInfo) => {
        test.setTimeout(journey.id.startsWith('atlas-') ? 300_000 : 120_000);
        testInfo.annotations.push({ type: 'scenario', description: journey.id });
        for (const name of journey.probes) {
          const { default: definition } = await import(`../docs/ux-check/probes/${name}.mjs`);
          if (!(definition.viewports ?? ['desktop', 'mobile']).includes(viewport)) {
            testInfo.annotations.push({ type: 'skipped-stage', description: `${name}: viewport ${viewport} outside scope` });
            continue;
          }
          await test.step(name, async () => {
            await probe.page.emulateMedia({ reducedMotion: definition.reducedMotion ? 'reduce' : 'no-preference' });
            await definition.setup?.(probe);
            const target = new URL(definition.route, probe.baseUrl);
            const response = await probe.page.goto(target.href, { waitUntil: 'domcontentloaded' });
            expect(response, `${name} navigation response`).not.toBeNull();
            expect(response?.ok(), `${name} navigation succeeds`).toBe(true);
            await expect(probe.page).toHaveURL(target.href);
            if (/^\/industry\/\d+$/.test(target.pathname)) {
              await expect(probe.page.getByRole('button', { name: 'Multibuy export' }).first()).toBeVisible({ timeout: 30_000 });
            } else if (target.pathname === '/sites') {
              await expect(probe.page.locator('[data-site-card], details[data-sites-row]').first()).toBeVisible({ timeout: 30_000 });
            } else if (target.pathname === '/') {
              await expect(probe.page.locator('[data-search-input]').first()).toBeVisible({ timeout: 30_000 });
            }
            await definition.run(probe);
          });
        }
      });
    });
  }
}
