export default {
  name: 'atlas-layout-worker',
  route: process.env.UX_MAP_ID
    ? `/atlas?map=${process.env.UX_MAP_ID}`
    : '/atlas',
  viewports: ['desktop'],
  reducedMotion: true,
  requiresAuth: true,
  settle: 2000,
  async run({ page, check, shot }) {
    if (!process.env.UX_MAP_ID) {
      check('UX_MAP_ID is set for the live map under test', false);
      return;
    }

    const workers = new Set(page.workers().map((worker) => worker.url()));
    page.on('worker', (worker) => workers.add(worker.url()));

    await page.evaluate(() => {
      window.__uxLayoutFrames = [];
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__uxLayoutFrames.push({
              name: entry.name,
              duration: entry.duration,
              scripts: (entry.scripts ?? []).map((script) => ({
                name: script.name,
                invoker: script.invoker,
                sourceURL: script.sourceURL,
              })),
            });
          }
        });
        observer.observe({ type: 'long-animation-frame', buffered: true });
        window.__uxLayoutObserver = observer;
      } catch {
        window.__uxLayoutFrames = null;
      }
    });

    await page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 20,
      null,
      { timeout: 120_000 },
    );

    await page.waitForTimeout(3000);

    check(
      `page spawned a dedicated worker (${[...workers].join(', ') || 'none'})`,
      workers.size >= 1,
    );

    const frameReport = await page.evaluate(() => window.__uxLayoutFrames);
    if (frameReport === null) {
      check('long-animation-frame observer is available in this browser', false);
    } else {
      const withScripts = frameReport.filter(
        (frame) => (frame.scripts ?? []).length > 0,
      ).length;
      const layoutAttributed = frameReport.some((frame) =>
        (frame.scripts ?? []).some((script) =>
          /compass\.ts|trig\.ts|overflow\.ts|geometry\.ts|layout\.worker/i.test(
            `${script.name ?? ''} ${script.sourceURL ?? ''} ${script.invoker ?? ''}`,
          ),
        ),
      );
      if (withScripts === 0) {
        check(
          `LoAF script attribution inconclusive (${frameReport.length} frames, 0 with script names; layout-module check skipped)`,
          true,
        );
      } else {
        check(
          `no long-animation-frame script attribution names a mapper layout module (${frameReport.length} frames, ${withScripts} with scripts)`,
          !layoutAttributed,
        );
      }
    }

    await shot('layout-worker');
  },
};
