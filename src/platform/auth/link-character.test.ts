import { expect, onTestFinished, test, vi } from 'vitest';

const client = vi.hoisted(() => ({ signInOauth2: vi.fn(), link: vi.fn() }));

// The client methods are async wrappers so the request promise is one no spy
// has seen: a spy marks every promise it returns as handled, which would hide
// a missing catch.
vi.mock('./auth-client', () => ({
  authClient: {
    signIn: { oauth2: async (body: unknown) => client.signInOauth2(body) },
    oauth2: { link: async (body: unknown) => client.link(body) },
  },
}));

import { startCharacterLink, startEveSignIn } from './link-character';

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

test('startEveSignIn asks the auth client for EVE sign-in, returning home by default', () => {
  client.signInOauth2.mockResolvedValue({ data: { url: 'https://login.eveonline.test', redirect: true }, error: null });

  startEveSignIn('/industry');
  expect(client.signInOauth2).toHaveBeenLastCalledWith({ providerId: 'eve', callbackURL: '/industry' });

  startEveSignIn();
  expect(client.signInOauth2).toHaveBeenLastCalledWith({ providerId: 'eve', callbackURL: '/' });
});

test('startEveSignIn swallows a rejected sign-in request', async () => {
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  onTestFinished(() => {
    process.off('unhandledRejection', unhandled);
  });
  client.signInOauth2.mockRejectedValue(new TypeError('Failed to fetch'));

  startEveSignIn('/');
  await settled();

  expect(client.signInOauth2).toHaveBeenCalled();
  expect(unhandled).not.toHaveBeenCalled();
});

test('startCharacterLink links another EVE character and comes back to the callback either way', () => {
  client.link.mockResolvedValue({ data: { url: 'https://login.eveonline.test', redirect: true }, error: null });

  startCharacterLink();
  expect(client.link).toHaveBeenLastCalledWith({
    providerId: 'eve',
    callbackURL: '/settings/characters',
    errorCallbackURL: '/settings/characters',
  });

  startCharacterLink('/atlas?map=one');
  expect(client.link).toHaveBeenLastCalledWith({
    providerId: 'eve',
    callbackURL: '/atlas?map=one',
    errorCallbackURL: '/atlas?map=one',
  });
});
