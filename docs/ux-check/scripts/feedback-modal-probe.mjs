// Open-state probe for the FeedbackModal (3.8.2.2.1): opens the feedback dialog,
// proving the migrated Textarea (inset well) + footer Buttons render on a dialog
// over its backdrop — the dark-surface field-contrast gate. Does NOT auto-wipe
// captures/ (so it sits alongside the sweep shots).
//   node docs/ux-check/scripts/feedback-modal-probe.mjs
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function probe(ctx, tag) {
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

  const trigger = page.getByRole('button', { name: 'Feedback' }).first();
  await trigger.click({ force: true });
  await page.waitForTimeout(500);

  // The migrated Textarea is the modal's message box.
  const textarea = page.locator('textarea').first();
  const opened = (await textarea.count()) > 0 && (await textarea.isVisible());
  if (opened) {
    await textarea.fill('Testing the engraved field on the dialog surface.');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/feedback-modal-open--${tag}.png` });
  }

  const cancel = await page.getByRole('button', { name: 'Cancel' }).count();
  const send = await page.getByRole('button', { name: /Send/ }).count();

  const csp = await page.evaluate(() => window.__csp__ ?? []);
  const styleV = csp.filter((e) => /style-src/i.test(e.violatedDirective));
  const nonConvole = consoleErrors.filter((e) => !/3210|ERR_CONNECTION_REFUSED|sync/.test(e));
  console.log(`  opened=${opened} | footer: Cancel=${cancel} Send=${send}`);
  console.log(`  style-src violations: ${styleV.length === 0 ? '0 ✓' : JSON.stringify(styleV)}`);
  console.log(`  page errors: ${pageErrors.length} | non-Convex console errors: ${nonConvole.length}`);
  if (nonConvole.length) console.log('   ', nonConvole.slice(0, 3));
  await page.close();
  return { opened, clean: styleV.length === 0 && pageErrors.length === 0 && nonConvole.length === 0 && cancel > 0 && send > 0 };
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const r1 = await probe(desktop, 'desktop');
const mobile = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const r2 = await probe(mobile, 'mobile');

await browser.close();
const ok = r1.clean && r2.clean && r1.opened && r2.opened;
console.log(`\n${ok ? `✓ CLEAN — feedback dialog opens desktop+mobile, migrated field+buttons render, CSP clean. Shots in ${OUT}/` : '✗ see output'}`);
process.exit(ok ? 0 : 1);
