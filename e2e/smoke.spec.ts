import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { assertPrincipal, assertRouteOutcome, type ExpectedPrincipal } from './route-contracts';

const READY_TIMEOUT = 15_000;

async function expectSession(page: Page, principal: ExpectedPrincipal) {
  const session = await page.evaluate(async () => {
    // eslint-disable-next-line no-restricted-syntax -- This callback executes in the page with its authenticated cookies.
    const response = await fetch('/api/auth/get-session', { credentials: 'same-origin', signal: AbortSignal.timeout(10_000) });
    const body: unknown = await response.json();
    return { status: response.status, body };
  });
  expect(session.status, 'Authenticated session endpoint').toBe(200);
  assertPrincipal({ session: session.body, expected: principal });
  await expect(page.getByRole('button', {
    name: `${principal.name} — account menu`, exact: true,
  })).toBeVisible({ timeout: READY_TIMEOUT });
  await expect(page.getByRole('button', { name: /Log in with EVE Online/i })).toHaveCount(0);
}

async function expectRoute({ page, baseURL, path, ready, settle }: {
  page: Page;
  baseURL: string | undefined;
  path: string;
  ready: Locator;
  settle?: () => Promise<void>;
}) {
  if (!baseURL) throw new Error('BLOCKED: mandatory routes require a baseURL');
  const expectedURL = new URL(path, baseURL).href;
  const response = await page.goto(expectedURL);
  await expect(page).toHaveURL(expectedURL);
  await expect(ready).toBeVisible({ timeout: READY_TIMEOUT });
  await settle?.();
  assertRouteOutcome({
    actualURL: page.url(), expectedURL, status: response?.status() ?? null,
    ready: await ready.isVisible(),
    errorShell: await page.getByRole('heading', { name: 'Pod malfunction', exact: true }).isVisible(),
  });
}

function homeReady(page: Page) {
  return page.getByRole('link', { name: /^Wormhole Sites Browse wormhole/ });
}

test('[home-public] public home exposes the tool catalogue', async ({ page, baseURL }) => {
  await expectRoute({ page, baseURL, path: '/', ready: homeReady(page) });
  await expect(page.getByRole('button', { name: /Log in with EVE Online/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Industry Planner Manufacturing/ })).toBeVisible();
  await page.locator('nav[aria-label="Tools"] a[href="/atlas"]').first().click();
  await expect(page).toHaveURL(new URL('/atlas', baseURL).href);
  await expect(page.locator('[data-atlas-guest-landing]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new URL('/', baseURL).href);
  await expect(homeReady(page)).toBeVisible();
});

test('[atlas-guest] public Atlas explains access and tracking setup', async ({ page, baseURL }) => {
  await expectRoute({
    page, baseURL, path: '/atlas', ready: page.locator('[data-atlas-guest-landing]'),
    settle: async () => {
      await expect(page.getByRole('heading', { name: 'Atlas', exact: true })).toBeVisible();
      await expect(page.locator('[data-atlas-guest-steps] > li')).toHaveCount(3);
      await expect(page.locator('[data-atlas-guest-landing]').getByRole('button', {
        name: /Log in with EVE Online/i,
      })).toBeVisible();
      await expect(page.locator('[data-map-catalogue]')).toHaveCount(0);
    },
  });
});

test('[route-home] authenticated home resolves the required principal', async ({ authenticatedPage: page, principal, baseURL }) => {
  await expectRoute({ page, baseURL, path: '/', ready: homeReady(page) });
  await expectSession(page, principal);
});

test('[route-industry] authenticated industry dashboard resolves its sections', async ({ authenticatedPage: page, principal, baseURL }) => {
  await expectRoute({
    page, baseURL, path: '/industry',
    ready: page.getByRole('button', { name: /search for any blueprint or reaction to get started/ }),
    settle: async () => {
      await expect(page.getByRole('heading', { name: 'Industry', exact: true })).toBeVisible();
      await expect(page.locator('[aria-label^="Loading "]')).toHaveCount(0);
      await expect(page.getByText('Templates', { exact: true })).toBeVisible();
      await expect(page.getByText('Corporation industry jobs', { exact: true })).toBeVisible();
      const templates = page.locator('section').filter({ has: page.getByText('Templates', { exact: true }) });
      await expect(templates.getByText('No saved templates yet — save one from the planner', { exact: true })
        .or(templates.locator('a[href*="?plan="]').first())).toBeVisible();
    },
  });
  await expectSession(page, principal);
});

test('[route-atlas] authenticated Atlas loads the authorized map catalogue', async ({ authenticatedPage: page, principal, baseURL }) => {
  await expectRoute({
    page, baseURL, path: '/atlas',
    ready: page.getByRole('button', { name: 'Create new map', exact: true }),
    settle: async () => {
      await expect(page.locator('[data-map-catalogue]')).toBeVisible();
      await expect(page.locator('[data-map-catalogue-unavailable], [data-atlas-guest-landing]')).toHaveCount(0);
    },
  });
  await expectSession(page, principal);
});

for (const route of [
  { id: 'route-skills', path: '/skills', title: 'Skill Queues' },
  { id: 'route-jobs', path: '/jobs', title: 'Industry Jobs' },
]) {
  test(`[${route.id}] authenticated ${route.path} resolves the character panel`, async ({ authenticatedPage: page, principal, baseURL }) => {
    await expectRoute({
      page, baseURL, path: route.path,
      ready: page.getByText('Synced from ESI on view', { exact: true }),
      settle: async () => {
        await expect(page.getByRole('heading', { name: route.title, exact: true })).toBeVisible();
        await expect(page.locator('[aria-label^="Loading "]')).toHaveCount(0);
        await expect(page.getByRole('button', { name: `Reconnect ${principal.name} to track`, exact: true })
          .or(page.getByRole('button', { name: `Show ${principal.name}`, exact: true }))
          .or(page.getByRole('button', { name: `Hide ${principal.name}`, exact: true }))).toBeVisible();
      },
    });
    await expectSession(page, principal);
  });
}

test('[route-structures] authenticated structures loads the saved-structure editor', async ({ authenticatedPage: page, principal, baseURL }) => {
  await expectRoute({
    page, baseURL, path: '/structures',
    ready: page.getByRole('textbox', { name: 'Structure name', exact: true }),
    settle: async () => {
      await expect(page.getByRole('heading', { name: 'Structures', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save structure', exact: true })).toBeVisible();
      await expect(page.getByText(/^Your structures \(\d+\)$/)).toBeVisible();
    },
  });
  await expectSession(page, principal);
});
