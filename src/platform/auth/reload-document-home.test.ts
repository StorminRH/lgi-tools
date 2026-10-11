import { expect, onTestFinished, test, vi } from 'vitest';
import { SIGNED_IN_HINT_KEY } from './signed-in-hint';

const signOut = vi.hoisted(() => vi.fn());

// An async wrapper, so the sign-out promise is one no spy has seen: a spy marks
// every promise it returns as handled, which would hide an unhandled rejection.
vi.mock('./auth-client', () => ({ authClient: { signOut: async () => signOut() } }));

import { reloadDocumentHome, signOutAndLeave } from './reload-document-home';

/** A browser that was signed in on /sites and still holds a retired preference cookie. */
function signedInBrowser() {
  const store = new Map<string, string>([[SIGNED_IN_HINT_KEY, '1']]);
  const cookieWrites: string[] = [];
  const location = { href: '/sites' };
  vi.stubGlobal('window', {
    location,
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
  vi.stubGlobal('document', {
    set cookie(value: string) {
      cookieWrites.push(value);
    },
  });
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  return { store, cookieWrites, location };
}

function watchUnhandledRejections() {
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  onTestFinished(() => {
    process.off('unhandledRejection', unhandled);
  });
  return unhandled;
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

test('reloadDocumentHome forgets the signed-in browser, then navigates to the target or home', () => {
  const browser = signedInBrowser();

  reloadDocumentHome();

  expect(browser.store.has(SIGNED_IN_HINT_KEY)).toBe(false);
  expect(browser.cookieWrites).toContain('lgi_pref_sites_view=; Path=/; Max-Age=0; SameSite=Lax');
  expect(browser.location.href).toBe('/');

  browser.store.set(SIGNED_IN_HINT_KEY, '1');
  reloadDocumentHome('https://developers.eveonline.com/authorized-apps');

  expect(browser.store.has(SIGNED_IN_HINT_KEY)).toBe(false);
  expect(browser.location.href).toBe('https://developers.eveonline.com/authorized-apps');
});

test('signOutAndLeave waits for sign-out, then forgets the browser and leaves for the target', async () => {
  const browser = signedInBrowser();
  signOut.mockResolvedValue({ data: { success: true }, error: null });

  signOutAndLeave('/settings/account');

  expect(signOut).toHaveBeenCalled();
  expect(browser.location.href).toBe('/sites');
  expect(browser.store.get(SIGNED_IN_HINT_KEY)).toBe('1');

  await settled();

  expect(browser.location.href).toBe('/settings/account');
  expect(browser.store.has(SIGNED_IN_HINT_KEY)).toBe(false);
});

test('signOutAndLeave still leaves home when sign-out fails or rejects, and handles the rejection', async () => {
  const browser = signedInBrowser();
  const unhandled = watchUnhandledRejections();

  signOut.mockResolvedValue({ data: null, error: { status: 403 } });
  signOutAndLeave();
  await settled();

  expect(browser.location.href).toBe('/');
  expect(browser.store.has(SIGNED_IN_HINT_KEY)).toBe(false);

  browser.location.href = '/sites';
  browser.store.set(SIGNED_IN_HINT_KEY, '1');
  signOut.mockRejectedValue(new TypeError('Failed to fetch'));
  signOutAndLeave();
  await settled();

  expect(browser.location.href).toBe('/');
  expect(browser.store.has(SIGNED_IN_HINT_KEY)).toBe(false);
  expect(unhandled).not.toHaveBeenCalled();
});
