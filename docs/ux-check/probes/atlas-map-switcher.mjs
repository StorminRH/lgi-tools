const route = () =>
  process.env.UX_MAP_ID ? `/atlas?map=${process.env.UX_MAP_ID}` : '/atlas';

const visibleNodeNames = (page) =>
  page.locator('[data-map-canvas]:visible [data-chain-node-name]').allTextContents();

const visibleWindowContent = (page) =>
  page.locator('[data-map-window]:visible').evaluateAll((windows) =>
    windows.map((window) => {
      const windowId = window.getAttribute('data-map-window') ?? 'unknown';
      const text = window.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return `${windowId}:${text}`;
    }),
  );

export default {
  name: 'atlas-map-switcher',
  route: route(),
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 1500,
  async run({ page, check }) {
    const firstMapId = process.env.UX_MAP_ID;
    const secondMapId = process.env.UX_SECOND_MAP_ID;
    if (!firstMapId || !secondMapId) {
      check('UX_MAP_ID and UX_SECOND_MAP_ID identify two authorized maps', false);
      return;
    }

    const trigger = page.locator('[data-map-switcher-trigger]');
    await trigger.waitFor({ state: 'visible', timeout: 60_000 });
    check('the selected map name is the top-center switcher trigger', await trigger.isVisible());
    check('the first map is selected', (await trigger.getAttribute('data-map-id')) === firstMapId);
    const firstNames = new Set(await visibleNodeNames(page));
    const firstWindows = new Set(await visibleWindowContent(page));
    const historyBefore = await page.evaluate(() => history.length);

    await page.evaluate(() => {
      window.__atlasSwitcherFrames = [];
      window.__atlasSwitcherRecording = true;
      const sample = () => {
        if (!window.__atlasSwitcherRecording) return;
        window.__atlasSwitcherFrames.push({
          href: location.href,
          names: [...document.querySelectorAll('[data-map-canvas] [data-chain-node-name]')]
            .filter((element) => element.checkVisibility?.() !== false)
            .map((element) => element.textContent?.trim() ?? ''),
          windows: [...document.querySelectorAll('[data-map-window]')]
            .filter((element) => element.checkVisibility?.() !== false)
            .map((element) => {
              const windowId = element.getAttribute('data-map-window') ?? 'unknown';
              const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
              return `${windowId}:${text}`;
            }),
        });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await trigger.click();
    const target = page.locator(`[data-map-switcher-map="${secondMapId}"]`);
    await target.waitFor({ state: 'visible', timeout: 10_000 });
    await target.click();
    await page.waitForURL((url) => url.searchParams.get('map') === secondMapId, {
      timeout: 10_000,
    });
    await page
      .locator(`[data-map-switcher-trigger][data-map-id="${secondMapId}"]`)
      .waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(1500);
    const secondNames = new Set(await visibleNodeNames(page));
    const secondWindows = new Set(await visibleWindowContent(page));
    const frames = await page.evaluate(() => {
      window.__atlasSwitcherRecording = false;
      return window.__atlasSwitcherFrames;
    });
    const firstOnly = [...firstNames].filter((name) => !secondNames.has(name));
    const firstOnlyWindows = [...firstWindows].filter(
      (windowContent) => !secondWindows.has(windowContent),
    );
    const staleFrames = frames.filter((frame) => {
      const frameUrl = new URL(frame.href);
      return frameUrl.searchParams.get('map') === secondMapId
        && (firstOnly.some((name) => frame.names.includes(name))
          || firstOnlyWindows.some((windowContent) => frame.windows.includes(windowContent)));
    });
    check(
      'no prior-map node or window content renders after the pushed map target commits',
      firstOnly.length + firstOnlyWindows.length > 0 && staleFrames.length === 0,
    );
    check('switching pushes one browser history entry', (await page.evaluate(() => history.length)) > historyBefore);

    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => url.searchParams.get('map') === firstMapId, {
      timeout: 10_000,
    });
    await page
      .locator(`[data-map-switcher-trigger][data-map-id="${firstMapId}"]`)
      .waitFor({ state: 'visible', timeout: 60_000 });
    check('browser Back returns to the prior map', true);
  },
};
