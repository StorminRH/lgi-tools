import { authoringMapId, authoringRoute, waitForEditableMap } from '../lib/authoring-helpers.mjs';

const observations = new WeakMap();

async function observe(page) {
  const frames = [];
  observations.set(page, frames);
  page.on('websocket', (socket) => {
    if (!/^\/api\/[^/]+\/sync$/.test(new URL(socket.url()).pathname)) return;
    socket.on('framesent', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'Mutation' && message.udfPath === 'engine:heartbeat') {
        frames.push(message.args[0]);
      }
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
}

const intervals = (pages) => pages.flatMap((page) =>
  observations.get(page).filter((frame) => frame.reason === 'interval'));

async function waitForBeat(page) {
  for (let attempts = 0; attempts < 100; attempts++) {
    if (observations.get(page).length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('No heartbeat from the tracked fixture. Set UX_MAP_ID to an accessible map with active tracking.');
}

async function visibility(page, state) {
  await page.evaluate((next) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => next });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

async function lifecycle(page, name, persisted) {
  await page.evaluate(({ name, persisted }) => {
    window.dispatchEvent(new PageTransitionEvent(name, { persisted }));
  }, { name, persisted });
}

async function cadence(pages, ms = 20_000) {
  await pages[0].clock.runFor(ms);
  await new Promise((resolve) => setTimeout(resolve, 250));
}

export default {
  name: 'atlas-heartbeat-coordination',
  route: authoringRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 1000,
  async setup({ page }) {
    await page.clock.install();
    await observe(page);
  },
  async run({ page, createPage, check, baseUrl }) {
    if (!authoringMapId()) throw new Error('UX_MAP_ID must identify a tracked local fixture');
    await waitForEditableMap(page);
    await waitForBeat(page);
    const pages = [page];
    for (let index = 0; index < 2; index++) {
      const peer = await createPage();
      await observe(peer);
      await peer.goto(new URL(authoringRoute(), baseUrl).href, { waitUntil: 'domcontentloaded' });
      await waitForEditableMap(peer);
      await waitForBeat(peer);
      pages.push(peer);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    check('three tabs send their own mount beat', pages.every((tab) =>
      observations.get(tab).some((frame) => frame.reason === 'mount')));
    const owners = pages.map((tab) => observations.get(tab).at(-1).expectedUserId);
    check('three tabs share the authenticated account scope',
      owners.every((owner) => typeof owner === 'string' && owner === owners[0]));

    const before = intervals(pages).length;
    await cadence(pages);
    check('three tabs emit one aggregate interval beat per cadence', intervals(pages).length - before === 1);
    const firstInterval = intervals(pages).at(-1);
    const hints = [...new Set(pages.flatMap((tab) => observations.get(tab)
      .find((frame) => frame.reason === 'mount').characterIdsHint))].sort((a, b) => a - b);
    check('elected interval contains the active hints union',
      JSON.stringify(firstInterval?.characterIdsHint) === JSON.stringify(hints));

    const firstLeader = pages.find((tab) => observations.get(tab).some((frame) =>
      frame.reason === 'interval' && frame.tabId === firstInterval?.tabId));
    const visiblePeer = pages.find((tab) => tab !== firstLeader);
    for (const tab of pages) await visibility(tab, tab === visiblePeer ? 'visible' : 'hidden');
    const beforeVisible = intervals(pages).length;
    await cadence(pages);
    const visibleFrame = intervals([visiblePeer]).at(-1);
    check('visible peer takes interval ownership from hidden peers',
      intervals(pages).length - beforeVisible === 1 && visibleFrame?.visible === true);

    const leaves = [];
    page.context().on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/sync-leave') leaves.push(request.postData());
    });
    const beforeSuspend = observations.get(visiblePeer).length;
    await lifecycle(visiblePeer, 'pagehide', true);
    await cadence(pages);
    check('persisted pagehide suspends beats without a leave request',
      observations.get(visiblePeer).length === beforeSuspend && leaves.length === 0);
    const oldId = observations.get(visiblePeer).at(-1).tabId;
    await lifecycle(visiblePeer, 'pageshow', true);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const resumed = observations.get(visiblePeer).at(-1);
    check('persisted pageshow rejoins immediately with a fresh tab id',
      resumed.reason === 'mount' && resumed.tabId !== oldId && resumed.visible === true);

    await lifecycle(visiblePeer, 'pagehide', false);
    await new Promise((resolve) => setTimeout(resolve, 250));
    check('departing owner sends the existing server-fenced leave request', leaves.length === 1);
    const survivors = pages.filter((tab) => tab !== visiblePeer);
    await visiblePeer.close();
    const beforeHidden = intervals(survivors).length;
    await cadence(survivors);
    check('remaining hidden tabs continue with one interval writer',
      intervals(survivors).length - beforeHidden === 1
      && intervals(survivors).at(-1)?.visible === false);

    const latest = intervals(survivors).at(-1);
    const silentOwner = survivors.find((tab) => observations.get(tab).some((frame) =>
      frame.reason === 'interval' && frame.tabId === latest.tabId));
    const survivor = survivors.find((tab) => tab !== silentOwner);
    await silentOwner.close();
    const beforeRecovery = intervals([survivor]).length;
    await cadence([survivor], 80_000);
    check('a surviving tab resumes interval beats after silent owner loss',
      intervals([survivor]).length > beforeRecovery);
    const beforeReturn = observations.get(survivor).length;
    await visibility(survivor, 'visible');
    await new Promise((resolve) => setTimeout(resolve, 250));
    check('visible return emits an immediate visible beat',
      observations.get(survivor).length > beforeReturn
      && observations.get(survivor).at(-1).reason === 'visible');

    await survivor.getByRole('button', { name: /account menu$/ }).click();
    await survivor.getByRole('menuitem', { name: 'Log out', exact: true }).click();
    await survivor.waitForURL(new URL('/', baseUrl).href);
    const afterLogout = observations.get(survivor).length;
    await cadence([survivor]);
    check('logout stops the remaining heartbeat session',
      observations.get(survivor).length === afterLogout
      && await survivor.locator('[data-account-menu-trigger]').count() === 0);
  },
};
