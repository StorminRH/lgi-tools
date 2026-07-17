const ROUTES = ['/', '/contact', '/industry/11372'];
const STATE = new WeakMap();

export default {
  name: 'eve-image-network',
  route: ROUTES[0],
  viewports: ['desktop'],
  settle: 2000,
  async setup({ page }) {
    const state = { currentRoute: ROUTES[0], requests: new Map(), consoleErrors: [] };
    for (const route of ROUTES) state.requests.set(route, new Set());
    page.on('request', (request) => {
      const url = request.url();
      if (
        request.resourceType() === 'image' ||
        url.includes('/_next/image') ||
        url.includes('images.evetech.net')
      ) {
        state.requests.get(state.currentRoute).add(url);
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error') state.consoleErrors.push(message.text());
    });
    STATE.set(page, state);
  },
  async run({ page, baseUrl, check }) {
    const state = STATE.get(page);
    for (const [index, route] of ROUTES.entries()) {
      if (index > 0) {
        state.currentRoute = route;
        await page.goto(new URL(route, baseUrl).href, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        await page.waitForTimeout(2000);
      }
      check(`${route} issues at least one image request`, state.requests.get(route).size > 0);
    }
    const requests = [...state.requests.values()].flatMap((items) => [...items]);
    check('EVE images load directly from images.evetech.net', requests.some((url) => url.startsWith('https://images.evetech.net/')));
    check('no request uses the Next image optimizer', !requests.some((url) => url.includes('/_next/image')));
    check(
      'no missing-loader-width error is reported',
      !state.consoleErrors.some((message) => message.includes('next-image-missing-loader-width')),
    );
    check(
      'no hydration error is reported',
      !state.consoleErrors.some((message) => /hydration|hydrated/i.test(message)),
    );
  },
};
