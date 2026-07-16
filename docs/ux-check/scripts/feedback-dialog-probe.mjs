// Open-state proof for the shared Feedback dialog on the public home route.
//
// Run from the repository root while the local stack is up:
//
//   node docs/ux-check/scripts/feedback-dialog-probe.mjs
//
// Outputs desktop/mobile screenshots under docs/ux-check/captures/feedback/ and
// exits non-zero if focus, keyboard/touch behavior, CSP, or page errors regress.
import { chromium, devices } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/';
const OUT = 'docs/ux-check/captures/feedback';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function probe(context, tag, touch) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__feedbackCsp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__feedbackCsp.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
      });
    });
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  const trigger = page.getByRole('button', { name: 'Feedback' });
  if (touch) {
    const stacking = await trigger.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const style = getComputedStyle(element);
      return {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
        position: style.position,
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents,
        topElement: `${top?.tagName ?? 'none'}.${top?.className ?? ''}`,
      };
    });
    console.log(`[${tag}] stacking=${JSON.stringify(stacking)}`);
    await page.touchscreen.tap(stacking.x, stacking.y);
  }
  else {
    await trigger.focus();
    await page.keyboard.press('Enter');
  }

  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  const textarea = page.getByRole('textbox', { name: 'Feedback' });
  const focused = await textarea.evaluate((element) => element === document.activeElement);
  await textarea.fill('UI system probe');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/feedback-dialog--${tag}.png` });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });

  const csp = await page.evaluate(() => window.__feedbackCsp ?? []);
  const styleViolations = csp.filter((entry) => /style-src/i.test(entry.directive));
  console.log(
    `[${tag}] opened=true focused=${focused} escape-closes=true style-src=${styleViolations.length} page-errors=${pageErrors.length}`,
  );
  await page.close();
  return focused && styleViolations.length === 0 && pageErrors.length === 0;
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const desktopClean = await probe(desktop, 'desktop', false);
const mobile = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const mobileClean = await probe(mobile, 'mobile', true);

await browser.close();
const clean = desktopClean && mobileClean;
console.log(clean ? `CLEAN — screenshots in ${OUT}/` : 'FAILED — see probe output');
process.exit(clean ? 0 : 1);
