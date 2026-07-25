// Structural probe for the generated architecture map on the Fallow devlog page.
// It checks that the SVG actually rendered server-side, that the DOM it produced
// agrees with the counts the component declares, and that a narrow viewport scrolls
// the figure rather than the page.

const ROUTE = '/devlog/fallow';
const PASSAGE = 'generated straight from';
const LEGEND_ROWS = 4;

export default {
  name: 'devlog-zone-map',
  route: ROUTE,
  viewports: ['desktop', 'mobile'],
  settle: 800,
  async run({ page, viewport, check, shot }) {
    const svg = page.locator('svg[data-zone-map]');
    const rendered = await svg.count();
    check(`${ROUTE} renders exactly one generated zone map`, rendered === 1);
    if (rendered !== 1) return;

    // The component publishes what it believes it drew; the DOM has to agree.
    const declared = await svg.evaluate((node) => ({
      zones: Number(node.dataset.zoneCount),
      cells: Number(node.dataset.cellCount),
    }));
    const cells = await page.locator('svg[data-zone-map] [data-zone-cell]').count();
    const labels = await page.locator('svg[data-zone-map] text').count();

    check(`${viewport} declares a non-empty matrix`, declared.zones > 0 && declared.cells > 0);
    check(`${viewport} draws every declared permission cell (${cells}/${declared.cells})`, cells === declared.cells);
    check(
      `${viewport} labels both axes plus the legend (${labels}/${declared.zones * 2 + LEGEND_ROWS})`,
      labels === declared.zones * 2 + LEGEND_ROWS,
    );

    // An SVG <title> is not an HTMLElement, so read textContent rather than innerText.
    const title = await page.$eval('svg[data-zone-map] > title', (node) => node.textContent ?? '');
    check(`${viewport} names the matrix for assistive technology`, title.includes('zones'));

    const passage = await page.locator('.devlog-prose p', { hasText: PASSAGE }).count();
    check(`${viewport} shows the introducing passage`, passage > 0);

    // The figure must own its own overflow: its box stays inside the viewport and the
    // wide matrix scrolls within it. Deliberately scoped to the figure — the devlog
    // shell already carries a small pre-existing page-level overflow on every route,
    // which is not this map's to assert on.
    const overflow = await page.evaluate(() => {
      const svg = document.querySelector('svg[data-zone-map]');
      const wrapper = svg?.parentElement;
      const figure = svg?.closest('figure');
      if (!wrapper || !figure) return null;
      return {
        figureOverhang: Math.round(
          figure.getBoundingClientRect().right - document.documentElement.clientWidth,
        ),
        figureScrolls: wrapper.scrollWidth > wrapper.clientWidth,
      };
    });
    check(`${viewport} keeps the map figure inside the viewport`, overflow?.figureOverhang <= 1);
    if (viewport === 'mobile') {
      check('mobile scrolls the wide matrix inside the figure', overflow?.figureScrolls === true);
    }

    await shot('devlog-fallow-zone-map');
  },
};
