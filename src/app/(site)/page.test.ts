import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import Home from './page';

type AsyncElement = ReactElement<object, (props: object) => Promise<ReactNode>>;

async function renderAuthNotice(authError: string | string[] | undefined): Promise<string> {
  const page = Home({ searchParams: Promise.resolve({ auth_error: authError }) }) as ReactElement<{
    children: [ReactNode, ReactElement<{ children: AsyncElement }>, ReactNode];
  }>;
  const notice = page.props.children[1].props.children;
  return renderToStaticMarkup(await notice.type(notice.props));
}

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
