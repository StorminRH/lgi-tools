import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import Home from './page';

type AsyncElement = ReactElement<object, (props: object) => Promise<ReactNode>>;

async function renderNotice(params: { [key: string]: string | string[] | undefined }): Promise<string> {
  const page = Home({ searchParams: Promise.resolve(params) }) as ReactElement<{
    children: [ReactNode, ReactElement<{ children: AsyncElement }>, ReactNode];
  }>;
  const notice = page.props.children[1].props.children;
  return renderToStaticMarkup(await notice.type(notice.props));
}

const renderAuthNotice = (authError: string | string[] | undefined) => renderNotice({ auth_error: authError });
const renderSignInNotice = (error: string | string[] | undefined) => renderNotice({ error });

test('the home notice explains each guard redirect and stays empty for any other auth_error value', async () => {
  const loginRequired = await renderAuthNotice('login_required');
  expect(loginRequired).toContain('>Auth<');
  expect(loginRequired).toContain('Log in with EVE to open your settings.');
  expect(await renderAuthNotice('admin_required')).toContain(
    'The admin dashboard is only available to authorized characters.',
  );

  // Prototype keys used to pass an `in` check and put a function into the notice.
  expect(await renderAuthNotice('constructor')).toBe('');
  expect(await renderAuthNotice('toString')).toBe('');
  expect(await renderAuthNotice(['login_required', 'admin_required'])).toBe('');
  expect(await renderAuthNotice(undefined)).toBe('');
});

const SIGN_IN_FAILED = 'Your EVE login didn&#x27;t finish. Please try again.';

test('the home notice explains a sign-in Better Auth refused and a link it refused', async () => {
  const notLinked = await renderSignInNotice('account_not_linked');
  expect(notLinked).toContain('>Auth<');
  expect(notLinked).toContain(
    'linked to an account here any more. Try signing in again, or sign in with a character on your account and add it under Settings → Characters.',
  );
  expect(notLinked).not.toContain(SIGN_IN_FAILED);

  const linkedElsewhere = await renderSignInNotice('account_already_linked_to_different_user');
  expect(linkedElsewhere).toContain('That character is already linked to another account.');
  expect(linkedElsewhere).not.toContain(SIGN_IN_FAILED);
});

test('any other error value reads as a login that did not finish, without echoing the code', async () => {
  for (const code of ['state_mismatch', 'internal_server_error', 'oauth_code_verification_failed', 'UNKNOWN']) {
    const notice = await renderSignInNotice(code);
    expect(notice).toContain('>Auth<');
    expect(notice).toContain(SIGN_IN_FAILED);
    expect(notice).not.toContain(code);
  }

  // Prototype keys get the fixed copy, never an inherited function.
  expect(await renderSignInNotice('constructor')).toContain(SIGN_IN_FAILED);

  // Better Auth forwards error_description unsanitised; the notice never renders it.
  const described = await renderNotice({ error: 'access_denied', error_description: '<b>injected</b>' });
  expect(described).toContain(SIGN_IN_FAILED);
  expect(described).not.toContain('injected');

  expect(await renderSignInNotice(['account_not_linked', 'account_not_linked'])).toBe('');
  expect(await renderSignInNotice(undefined)).toBe('');
});

test('a guard redirect notice wins over a sign-in error in the same query', async () => {
  const both = await renderNotice({ auth_error: 'login_required', error: 'account_not_linked' });
  expect(both).toContain('Log in with EVE to open your settings.');
  expect(both).not.toContain('linked to an account here');
});
