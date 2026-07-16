// Open-state probe for the asset-tracking ledger popover (3.7.7.2). `pnpm ux-check`
// captures only the CLOSED shell; this opens the QTY-ring popover on a real planner
// route and proves: the popover opens (hover/keyboard desktop, tap mobile), zero
// style-src CSP violations on the open state, and the LOGGED-OUT placeholder content
// renders ("No holdings tracked yet" + the Owned/Remaining "—" rows) — the
// byte-identical-when-owns-none evidence. Screenshots the open ledger.
//
//   PROBE_URL=http://localhost:3000/industry/23784 node docs/ux-check/scripts/asset-ledger-probe.mjs
//
// Shots → docs/ux-check/captures/ (auto-wiped at start of each run).
import { chromium, devices } from 'playwright';
import { rm, mkdir } from 'node:fs/promises';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/industry/23784';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function probe(ctx, tag, { tap }) {
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__csp__ = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp__.push({ violatedDirective: e.violatedDirective, blockedURI: e.blockedURI }),
    );
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  console.log(`\n[${tag}] → ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);

  // The QTY-ring trigger's accessible name is "<material> — asset tracking".
  const trigger = page.getByRole('button', { name: /asset tracking/i }).first();
  if ((await trigger.count()) === 0) {
    console.log('  ✗ no asset-tracking trigger found');
    await page.close();
    return { opened: false, clean: false };
  }
  await trigger.scrollIntoViewIfNeeded();
  if (tap) await trigger.tap();
  else {
    await trigger.focus();
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(450);
  const open = (await trigger.getAttribute('data-popup-open')) !== null;

  // The placeholder content must be present logged-out (byte-identical proof).
  const heldByPlaceholder = await page.getByText('No holdings tracked yet').first().count();
  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasLedgerLabels = ['Total Needed', 'Total Owned', 'Total Remaining'].every((l) => bodyText.includes(l));

  if (open) await page.screenshot({ path: `${OUT}/asset-ledger-open--${tag}.png` });

  let kb = '(tap)';
  if (!tap) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    kb = `escape-closes=${(await trigger.getAttribute('data-popup-open')) === null}`;
  }

  const csp = await page.evaluate(() => window.__csp__ ?? []);
  const styleV = csp.filter((e) => /style-src/i.test(e.violatedDirective));
  console.log(`  ${open ? '✓' : '✗'} opens=${open} | ${kb}`);
  console.log(`  placeholder "No holdings tracked yet": ${heldByPlaceholder > 0 ? '✓' : '✗'} | ledger labels: ${hasLedgerLabels ? '✓' : '✗'}`);
  console.log(`  style-src violations: ${styleV.length === 0 ? '0 ✓' : JSON.stringify(styleV)}`);
  console.log(`  page errors: ${pageErrors.length}`);
  await page.close();
  return {
    opened: open,
    clean: open && styleV.length === 0 && pageErrors.length === 0 && heldByPlaceholder > 0 && hasLedgerLabels,
  };
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const r1 = await probe(desktop, 'desktop', { tap: false });
const mobile = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const r2 = await probe(mobile, 'mobile', { tap: true });

await browser.close();
const ok = r1.clean && r2.clean;
console.log(`\n${ok ? `✓ CLEAN — ledger opens desktop+mobile, placeholders present, CSP clean. Shots in ${OUT}/` : '✗ see output'}`);
process.exit(ok ? 0 : 1);
