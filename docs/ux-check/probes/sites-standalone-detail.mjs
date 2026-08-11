// Session 4.0.4.3.3 G-1: /sites/[id] uses the standalone SiteCard presentation
// (always expanded, no collapse, house reading measure). Catalogue id 49 is
// Barren Perimeter Reservoir — the same site the atlas site-viewer probe opens.
export default {
  name: 'sites-standalone-detail',
  route: '/sites/49',
  viewports: ['desktop', 'mobile'],
  settle: 1500,
  async run({ page, check }) {
    const card = page.locator('[data-site-card][data-presentation="standalone"]');
    await card.waitFor({ state: 'visible', timeout: 15_000 });
    check('standalone site card is visible', await card.isVisible());
    // Wave cards may still use Collapsible internally; the site chrome itself
    // must not wrap the header/body in a card-level <details>.
    check(
      'standalone card chrome has no card-level collapse toggle',
      (await card.locator(':scope > details[data-collapsible]').count()) === 0
        && (await card.locator('details[data-collapsible] > summary').filter({
          hasText: 'Barren Perimeter Reservoir',
        }).count()) === 0,
    );
    check(
      'standalone card shows the site name',
      ((await card.textContent()) ?? '').includes('Barren Perimeter Reservoir'),
    );

    const measure = await card.evaluate((node) => {
      let host = node.parentElement;
      while (host !== null && !host.classList.contains('max-w-[32rem]')) {
        host = host.parentElement;
      }
      if (host === null) return null;
      return {
        hasDetailMeasure: true,
        width: host.getBoundingClientRect().width,
      };
    });
    check(
      'card sits in the G-1 detail measure (~2/3 reading)',
      measure !== null
        && measure.hasDetailMeasure === true
        && measure.width > 0
        && measure.width <= 512 + 1,
    );

    // RelatedSites stays full detail width by design — only the card is narrowed.
    const relatedHeading = page.getByRole('heading', { name: /related/i });
    check(
      'related sites section remains on the page outside the detail measure',
      (await relatedHeading.count()) === 1
        && (await relatedHeading.evaluate((node) => {
          let host = node.parentElement;
          while (host !== null) {
            if (host.classList.contains('max-w-[32rem]')) return false;
            host = host.parentElement;
          }
          return true;
        })),
    );
  },
};
