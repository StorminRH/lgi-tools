import { expect, test } from 'vitest';
import { openCodexScope } from './editing-scope';

test('a pencil opens its scope when nothing is in edit', () => {
  expect(openCodexScope(null, 'ships')).toBe('ships');
  expect(openCodexScope(null, 'page')).toBe('page');
});

test('a second pencil is ignored while a scope is open', () => {
  expect(openCodexScope('ships', 'route')).toBe('ships');
  expect(openCodexScope('ships', 'page')).toBe('ships');
  expect(openCodexScope('page', 'ships')).toBe('page');
});
