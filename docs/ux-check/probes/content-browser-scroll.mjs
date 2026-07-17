const STICKY_INSET = 24;
const TOLERANCE = 2;

function near(actual, expected) {
  return Math.abs(actual - expected) <= TOLERANCE;
}

async function metrics(page) {
  return page.evaluate(() => {
    const rail = document.querySelector('.content-browser-rail');
    const body = document.querySelector('.content-browser-rail-body');
    if (!(rail instanceof HTMLElement) || !(body instanceof HTMLElement)) {
      throw new Error('content-browser rail not found');
    }
    const railRect = rail.getBoundingClientRect();
    const bodyStyle = getComputedStyle(body);
    return {
      windowY: window.scrollY,
      viewportHeight: window.innerHeight,
      railTop: railRect.top,
      railBottom: railRect.bottom,
      railPosition: getComputedStyle(rail).position,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyScrollTop: body.scrollTop,
      bodyMaxHeight: bodyStyle.maxHeight,
      bodyOverflowY: bodyStyle.overflowY,
      bodyOverscrollY: bodyStyle.overscrollBehaviorY,
    };
  });
}

export default {
  name: 'content-browser-scroll',
  route: '/devlog/vercel',
  viewports: ['desktop', 'mobile'],
  async run({ page, viewport, check, shot }) {
    if (viewport === 'mobile') {
      const initial = await metrics(page);
      check('mobile rail is static', initial.railPosition === 'static');
      check('mobile rail body is fully visible', initial.bodyOverflowY === 'visible' && initial.bodyMaxHeight === 'none');
      const rail = page.locator('.content-browser-rail');
      const toggle = page.locator('.content-browser-rail-toggle');
      check('mobile rail toggle is visible', await toggle.isVisible());
      check('mobile rail starts open', (await rail.getAttribute('open')) === '');
      await toggle.click();
      check('mobile rail closes', (await rail.getAttribute('open')) === null);
      await toggle.click();
      check('mobile rail reopens', (await rail.getAttribute('open')) === '');
      await shot('mobile-open');
      return;
    }

    const initial = await metrics(page);
    check('desktop rail is sticky', initial.railPosition === 'sticky');
    check('desktop rail owns internal scrolling', initial.bodyOverflowY === 'auto' && initial.bodyOverscrollY === 'auto');
    check('desktop rail content overflows', initial.bodyScrollHeight > initial.bodyClientHeight);
    check('rail begins below its sticky stop', initial.railTop > STICKY_INSET + TOLERANCE);

    const followDistance = Math.min(40, (initial.railTop - STICKY_INSET) / 2);
    await page.evaluate((distance) => window.scrollTo(0, distance), followDistance);
    await page.waitForTimeout(250);
    const following = await metrics(page);
    check('rail follows the page before sticking', near(following.railTop, initial.railTop - followDistance));

    await page.evaluate(
      ({ railTop, inset }) => window.scrollTo(0, railTop - inset + 80),
      { railTop: initial.railTop, inset: STICKY_INSET },
    );
    await page.waitForTimeout(250);
    const stuck = await metrics(page);
    check('tall rail sticks at the top inset', near(stuck.railTop, STICKY_INSET));
    check('stuck rail remains inside the viewport', stuck.railBottom <= stuck.viewportHeight - STICKY_INSET + TOLERANCE);

    const body = page.locator('.content-browser-rail-body');
    await body.hover();
    const beforeInternal = await metrics(page);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(250);
    const afterInternal = await metrics(page);
    check('wheel scrolls the rail body', afterInternal.bodyScrollTop > beforeInternal.bodyScrollTop);
    check('internal scrolling leaves the page still', near(afterInternal.windowY, beforeInternal.windowY));
    await shot('desktop-scrolled');

    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const lastLinkVisible = await page.locator('.content-browser-nav-item').last().evaluate((link) => {
      const bodyElement = link.closest('.content-browser-rail-body');
      if (!(bodyElement instanceof HTMLElement)) return false;
      const linkRect = link.getBoundingClientRect();
      const bodyRect = bodyElement.getBoundingClientRect();
      return linkRect.top >= bodyRect.top - 1 && linkRect.bottom <= bodyRect.bottom + 1;
    });
    check('last navigation item is reachable', lastLinkVisible);
    const beforeChain = await metrics(page);
    await body.hover();
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(250);
    check('rail boundary chains scrolling to the page', (await metrics(page)).windowY > beforeChain.windowY);

    await page.locator('.content-browser-nav-group').evaluateAll((groups) => {
      for (const group of groups) group.open = false;
    });
    await body.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const shortInitial = await metrics(page);
    check('collapsed rail fits without internal scrolling', shortInitial.bodyScrollHeight <= shortInitial.bodyClientHeight + TOLERANCE);
    await page.evaluate(
      ({ railTop, inset }) => window.scrollTo(0, railTop - inset + 80),
      { railTop: shortInitial.railTop, inset: STICKY_INSET },
    );
    await page.waitForTimeout(250);
    check('short rail pins after the header clears', near((await metrics(page)).railTop, STICKY_INSET));
    await shot('desktop-short');
  },
};
