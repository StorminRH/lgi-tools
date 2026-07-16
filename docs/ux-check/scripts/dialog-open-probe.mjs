// Open-state probe for the /sites card lightbox (the Base UI Dialog primitive).
//
// `pnpm ux-check` captures only the CLOSED static shell. This forces the catalogue
// into lightbox mode (the `sites.detailMode` preference defaults to `expand`),
// opens a card on a REAL route, and proves: zero style-src CSP violations on the
// open state (Base UI writes inline placement/transition style — must stay clean
// under `style-src 'self' 'unsafe-inline'`), the dialog opens (role="dialog"),
// Escape closes it, and a touch-tap opens it on a mobile context. Functional + CSP
// only — no axe / formal a11y audit (deferred per the OOB.2.3 standing direction;
// Base UI's modal Dialog still provides focus-trap + scroll-lock + dismiss).
//
//   PROBE_URL=http://localhost:3000/sites node docs/ux-check/scripts/dialog-open-probe.mjs
//
// Screenshots → docs/ux-check/captures/ (auto-wiped at start of each run).
import { chromium, devices } from 'playwright';
import { rm, mkdir } from 'node:fs/promises';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/sites';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';

// Auto-wipe: each capture run leaves only its own latest shots (no storage creep).
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function probe(ctx, tag, { tap }) {
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    // Force lightbox mode before any app code runs (default is 'expand'); the
    // value is JSON-encoded, key = LS_PREFIX + the preference key.
    try {
      localStorage.setItem('lgi:pref:sites.detailMode', '"lightbox"');
    } catch {}
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
  await page.waitForTimeout(1500); // hydrate + attach the summary click interception

  // The actual <summary> element (unambiguous — `.sites-card-summary` is also a
  // class on the lightbox header wrapper).
  const summary = page.locator('.sites-card summary').first();
  if ((await summary.count()) === 0) {
    console.log('  ✗ no card summary found (is /sites rendering cards?)');
    await page.close();
    return { clean: false };
  }
  await summary.scrollIntoViewIfNeeded();
  if (tap) await summary.tap();
  else await summary.click();
  await page.waitForTimeout(450); // enter transition

  const dialog = page.getByRole('dialog');
  const opened = (await dialog.count()) > 0 && (await dialog.first().isVisible());
  if (opened) await page.screenshot({ path: `${OUT}/lightbox-open--${tag}.png` });

  // Escape dismisses; wait out the exit transition + unmount, then it's gone.
  let escClosed = '(n/a — never opened)';
  if (opened) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    escClosed = (await page.getByRole('dialog').count()) === 0;
  }

  console.log(
    `  ${opened ? '✓' : '✗'} opens=${opened} (${tap ? 'tap' : 'click'}) | escape-closes=${escClosed}`,
  );

  const csp = await page.evaluate(() => window.__csp__ ?? []);
  const styleV = csp.filter((e) => /style-src/i.test(e.violatedDirective));
  const other = csp.filter(
    (e) => !styleV.includes(e) && !/va\.vercel-scripts\.com/i.test(e.blockedURI ?? ''),
  );
  console.log(`  style-src violations: ${styleV.length === 0 ? '0 ✓' : JSON.stringify(styleV)}`);
  console.log(`  other CSP violations: ${other.length === 0 ? '0 ✓' : JSON.stringify(other)}`);
  console.log(`  console errors: ${consoleErrors.length} | page errors: ${pageErrors.length}`);
  await page.close();
  return {
    clean:
      opened &&
      escClosed === true &&
      styleV.length === 0 &&
      other.length === 0 &&
      pageErrors.length === 0,
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
console.log(
  `\n${ok ? `✓ CLEAN — lightbox opens desktop+mobile, Escape closes, CSP clean. Shots in ${OUT}/` : '✗ see output'}`,
);
process.exit(ok ? 0 : 1);
