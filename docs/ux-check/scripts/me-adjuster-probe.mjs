// Open-state probe for the 3.7.5.4 ME-adjuster sandbox. The shipped Popover is
// click-only here (openOnHover={false}), so this clicks (desktop) / taps (mobile)
// to open, proves zero style-src CSP violations + no page errors on the open
// state, smoke-tests the in-popover stepper "+", and screenshots the open overlay.
//
//   PROBE_URL=http://localhost:3000/dev/sandbox/me-adjuster \
//     node docs/ux-check/scripts/me-adjuster-probe.mjs
import { chromium, devices } from 'playwright';
import { rm, mkdir } from 'node:fs/promises';

const URL =
  process.env.PROBE_URL ?? 'http://localhost:3000/dev/sandbox/me-adjuster';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';
// Trigger accessible names present on the page (the `label` prop → aria-label).
const LABELS = [
  'Main blueprint — set material efficiency',
  'Fernite Carbide — set material efficiency',
];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function probe(ctx, tag, { touch }) {
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__csp__ = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp__.push({ violatedDirective: e.violatedDirective, blockedURI: e.blockedURI }),
    );
  });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  console.log(`\n[${tag}] → ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);

  let opened = 0;
  let stepperOk = true;
  for (const label of LABELS) {
    const t = page.getByRole('button', { name: label }).first();
    if ((await t.count()) === 0) {
      console.log(`  – "${label}": trigger not present (skipped)`);
      continue;
    }
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await t.scrollIntoViewIfNeeded();
    if (touch) await t.tap();
    else await t.click();
    await page.waitForTimeout(350);
    const open = (await t.getAttribute('data-popup-open')) !== null;
    let stepNote = '';
    if (open) {
      await page.screenshot({ path: `${OUT}/me-adjuster-open--${tag}--${slug}.png` });
      opened++;
      // Functional check scoped to the OPEN popover (not the always-present inline
      // steppers elsewhere on the page). Fernite Carbide is unowned (effective 0),
      // so its "+" is enabled and must increment the value span 0 → 1.
      const dialog = page.locator('[role=dialog]').last();
      const plus = dialog.getByRole('button', { name: /Increase .* material efficiency/ });
      if ((await plus.count()) > 0 && !(await plus.first().isDisabled())) {
        const val = dialog.locator('span').filter({ hasText: /^\d+$/ }).first();
        const before = await val.textContent();
        await plus.first().click();
        await page.waitForTimeout(200);
        const after = await val.textContent();
        const stillOpen = (await t.getAttribute('data-popup-open')) !== null;
        if (!stillOpen || Number(after) !== Number(before) + 1) stepperOk = false;
        stepNote = ` stepper:${before}→${after}`;
      }
    }
    // Escape closes (keyboard operability).
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const closed = (await t.getAttribute('data-popup-open')) === null;
    console.log(`  ${open ? '✓' : '✗'} "${label}" opens=${open} escape-closes=${closed}${stepNote}`);
  }

  const csp = await page.evaluate(() => window.__csp__ ?? []);
  const styleV = csp.filter((e) => /style-src/i.test(e.violatedDirective));
  const other = csp.filter(
    (e) => !styleV.includes(e) && !/va\.vercel-scripts\.com/i.test(e.blockedURI ?? ''),
  );
  // Synthetic mock type-ids 404 on the EVE image server by design (→ monogram).
  const realConsole = consoleErrors.filter(
    (m) => !/webpack-hmr|status of 404/.test(m),
  );
  console.log(`  style-src violations: ${styleV.length === 0 ? '0 ✓' : JSON.stringify(styleV)}`);
  console.log(`  other CSP violations: ${other.length === 0 ? '0 ✓' : JSON.stringify(other)}`);
  console.log(`  stepper "+" kept popover open: ${stepperOk ? '✓' : '✗'}`);
  console.log(`  real console errors: ${realConsole.length} | page errors: ${pageErrors.length}`);
  await page.close();
  return {
    opened,
    clean: styleV.length === 0 && other.length === 0 && pageErrors.length === 0 && stepperOk,
  };
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const r1 = await probe(desktop, 'desktop', { touch: false });
const mobile = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const r2 = await probe(mobile, 'mobile', { touch: true });

await browser.close();
const ok = r1.clean && r2.clean && r1.opened > 0 && r2.opened > 0;
console.log(`\n${ok ? `✓ CLEAN — opened desktop+mobile, CSP clean, stepper live. Shots in ${OUT}/` : '✗ see output'}`);
process.exit(ok ? 0 : 1);
