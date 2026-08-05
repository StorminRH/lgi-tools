import { expect, test, type Page } from '@playwright/test';
import { E2E_CHARACTER_NAME } from './auth-seed';

const CONSOLE_ALLOW = /convex|webpack-hmr|Fast Refresh|va\.vercel-scripts|ERR_CONNECTION_REFUSED/i;

function attachDiagnostics(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return {
    assertClean() {
      expect(pageErrors, pageErrors.join('\n')).toEqual([]);
      expect(
        consoleErrors.filter((text) => !CONSOLE_ALLOW.test(text)),
        consoleErrors.join('\n'),
      ).toEqual([]);
    },
  };
}

/** Proves the browser cookie is accepted by Better Auth (DB-backed session). */
async function expectAuthenticatedSession(page: Page) {
  const session = await page.request.get('/api/auth/get-session');
  expect(session.ok(), `get-session HTTP ${session.status()}`).toBeTruthy();
  const body = (await session.json()) as {
    user?: { name?: string };
    characterId?: number | null;
    name?: string;
  } | null;
  expect(body, 'get-session returned null — cookie not accepted').not.toBeNull();
  expect(body?.characterId ?? null).not.toBeNull();
  const displayName = body?.name ?? body?.user?.name;
  expect(displayName).toBe(E2E_CHARACTER_NAME);
}

/**
 * Tiny happy-path smoke: signed-out public shell, then seeded-session
 * authenticated account surfaces. Prefer role/label locators; assert outcomes
 * and keep console/page errors empty. Bar for adding cases stays high — see
 * docs/contributing/end-to-end-testing.md.
 */
test('public home shell loads without console or page errors', async ({ page }) => {
  const diag = attachDiagnostics(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /LGI.*\.tools/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Log in with EVE Online/i })).toBeVisible();
  diag.assertClean();
});

test.describe('authenticated smoke', () => {
  test.use({ storageState: 'docs/ux-check/captures/auth-storage.json' });

  test('seeded session is accepted and account shells settle signed-in', async ({ page }) => {
    const diag = attachDiagnostics(page);

    await page.goto('/');
    await expectAuthenticatedSession(page);
    // Desktop header: AccountMenu trigger label is "<name> — account menu".
    await expect(
      page.getByRole('button', { name: `${E2E_CHARACTER_NAME} — account menu` }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Log in with EVE Online/i })).toHaveCount(0);

    for (const route of ['/industry', '/skills', '/jobs', '/structures'] as const) {
      await page.goto(route);
      await expect(page.locator('body')).toBeVisible();
      await expectAuthenticatedSession(page);
      await expect(
        page.getByRole('button', { name: `${E2E_CHARACTER_NAME} — account menu` }),
      ).toBeVisible({ timeout: 15_000 });
    }

    diag.assertClean();
  });
});
