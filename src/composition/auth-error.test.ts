import { expect, test } from 'vitest';
import { authErrorHref, isAuthErrorCode } from './auth-error';

test('authErrorHref links home with the notice code', () => {
  expect(authErrorHref('login_required')).toBe('/?auth_error=login_required');
  expect(authErrorHref('admin_required')).toBe('/?auth_error=admin_required');
});

test('isAuthErrorCode accepts only the codes the guards send, never prototype keys or non-strings', () => {
  expect(isAuthErrorCode('login_required')).toBe(true);
  expect(isAuthErrorCode('admin_required')).toBe(true);

  expect(isAuthErrorCode('constructor')).toBe(false);
  expect(isAuthErrorCode('toString')).toBe(false);
  expect(isAuthErrorCode('__proto__')).toBe(false);
  expect(isAuthErrorCode(['login_required'])).toBe(false);
  expect(isAuthErrorCode(undefined)).toBe(false);
});
