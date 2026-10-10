import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
// The real dialog portals its body away from static markup; draw each one inline instead.
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ title, children }: { title: ReactNode; children?: ReactNode }) =>
    createElement('section', { 'data-confirm': title }, children),
}));

import { AccountDangerZone } from './AccountDangerZone';

test('the delete acknowledgement is named by the sentence it shows', () => {
  const html = renderToStaticMarkup(
    createElement(AccountDangerZone, { characters: [{ characterId: 9001, name: 'Aurel Vantesse' }] }),
  );
  const dialog = /<section data-confirm="Delete account">(.*?)<\/section>/.exec(html)?.[1] ?? '';
  const rowId = /^<label id="([^"]+)"/.exec(dialog)?.[1];
  const box = /<span[^>]*role="checkbox"[^>]*>/.exec(dialog)?.[0] ?? '';
  expect(rowId).toBeTruthy();
  // WCAG 2.5.3: the accessible name is the visible sentence, not a different aria-label.
  expect(box).toContain(` aria-labelledby="${rowId}"`);
  expect(box).not.toContain('aria-label=');
  expect(dialog).toMatch(/>I understand my account and all of my saved data will be lost\.<\/label>$/);
});
