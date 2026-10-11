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

test('the home notice explains a sign-in Better Auth refused and stays empty for any other error value', async () => {
  const notLinked = await renderSignInNotice('account_not_linked');
  expect(notLinked).toContain('>Auth<');
  expect(notLinked).toContain(
    'linked to an account here any more. Try signing in again, or sign in with a character on your account and add it under Settings → Characters.',
  );

  expect(await renderSignInNotice('state_mismatch')).toBe('');
  expect(await renderSignInNotice('internal_server_error')).toBe('');
  expect(await renderSignInNotice('constructor')).toBe('');
  expect(await renderSignInNotice(['account_not_linked', 'account_not_linked'])).toBe('');
  expect(await renderSignInNotice(undefined)).toBe('');
});

test('a guard redirect notice wins over a sign-in error in the same query', async () => {
  const both = await renderNotice({ auth_error: 'login_required', error: 'account_not_linked' });
  expect(both).toContain('Log in with EVE to open your settings.');
  expect(both).not.toContain('linked to an account here');
});
