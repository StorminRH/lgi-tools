import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { settle } from '@/lib/__tests__/hook-runtime';
import { apiProblem, networkDown } from '@/transport/__tests__/failed-outcomes';

const h = vi.hoisted(() => ({
  confirms: new Map<string, () => void>(),
  apiFetch: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
// The real dialog portals its body away from static markup; draw each one inline instead,
// and hand its confirm handler to the test by title.
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ title, children, onConfirm }: { title: string; children?: ReactNode; onConfirm: () => void }) => {
    h.confirms.set(title, onConfirm);
    return createElement('section', { 'data-confirm': title }, children);
  },
}));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));
vi.mock('@/components/ui/toast', () => ({ toast: h.toast }));

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

test('a refused purge or sign-out toasts why, with the wait a rate limit sets', async () => {
  h.confirms.clear();
  h.toast.error.mockReset();
  renderToStaticMarkup(
    createElement(AccountDangerZone, { characters: [{ characterId: 9001, name: 'Aurel Vantesse' }] }),
  );

  h.apiFetch.mockResolvedValueOnce(apiProblem(429, 'rate_limited', { retryAfterSeconds: 30 }));
  h.confirms.get('Purge character')?.();
  await settle();
  expect(h.toast.error).toHaveBeenLastCalledWith('Too many attempts. Try again in 30 seconds.');

  h.apiFetch.mockResolvedValueOnce(apiProblem(400, 'not_linked'));
  h.confirms.get('Purge character')?.();
  await settle();
  expect(h.toast.error).toHaveBeenLastCalledWith('That character is no longer linked to your account.');

  h.apiFetch.mockResolvedValueOnce(networkDown());
  h.confirms.get('Log out everywhere')?.();
  await settle();
  expect(h.toast.error).toHaveBeenLastCalledWith('Sign-out failed. Check your connection and try again.');
  expect(h.toast.error).toHaveBeenCalledTimes(3);
});
