import { expect, test } from 'vitest';
import { codexKindHref, resolveCodexSubject } from './subjects';

test('resolves lowercase entity keys and refuses everything else', () => {
  expect(resolveCodexSubject('wormholes', 'c247')).toEqual({ kind: 'wormholes', key: 'c247' });
  expect(resolveCodexSubject('classes', 'redoubt')).toEqual({ kind: 'classes', key: 'redoubt' });
  expect(resolveCodexSubject('sites', '20')).toEqual({ kind: 'sites', key: '20' });

  for (const [kind, key] of [
    ['wormholes', 'C247'],
    ['wormholes', 'k162'],
    ['classes', 'c7'],
    ['classes', 'C5'],
    ['sites', '020'],
    ['constructor', 'x'],
  ] as const) {
    expect(resolveCodexSubject(kind, key), `${kind}/${key}`).toBeNull();
  }
});

test('links each kind to its own index', () => {
  expect(codexKindHref('sites')).toBe('/codex/sites');
});
