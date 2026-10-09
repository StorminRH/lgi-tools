import type { ReactElement, ReactNode } from 'react';
import { expect, test, vi } from 'vitest';

// Hooks by call order: title, message, category, path, submit state.
const h = vi.hoisted(() => ({
  index: 0,
  values: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useId: () => 'feedback-title',
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => {
    const index = h.index++;
    const value = index in h.values ? h.values[index] : typeof initial === 'function' ? initial() : initial;
    h.setters[index] ??= vi.fn();
    return [value, h.setters[index]];
  },
}));

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/transport/api-client', () => api);

import { FeedbackModal } from './FeedbackModal';

type Props = Record<string, unknown> & { children?: ReactNode };

function findByName(node: ReactNode, name: string): ReactElement<Props> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByName(child as ReactNode, name);
      if (found) return found;
    }
    return null;
  }
  if (node === null || typeof node !== 'object' || !('props' in node)) return null;
  const element = node as ReactElement<Props>;
  if (typeof element.type === 'function' && element.type.name === name) return element;
  return findByName(element.props.children, name);
}

function render(values: Record<number, unknown> = {}) {
  h.index = 0;
  h.values = values;
  for (const setter of h.setters) setter.mockClear();
  const onClose = vi.fn();
  const dialog = FeedbackModal({ open: true, onClose, session: null, loading: false }) as ReactElement<Props>;
  const form = dialog.props.children as ReactElement<{ onSubmit: (event: unknown) => Promise<void> }>;
  const setState = () => h.setters[4]!;
  return {
    dialog,
    onClose,
    setState,
    async submit() {
      const preventDefault = vi.fn();
      await form.props.onSubmit({ preventDefault });
      expect(preventDefault).toHaveBeenCalled();
    },
  };
}

test('submitting checks the title, message and category before sending', async () => {
  const empty = render();
  await empty.submit();
  expect(empty.setState()).toHaveBeenCalledWith({
    kind: 'error', message: 'Please enter a title before sending.', field: 'title',
  });

  const noMessage = render({ 0: 'Map crash', 1: '   ' });
  await noMessage.submit();
  expect(noMessage.setState()).toHaveBeenCalledWith({
    kind: 'error', message: 'Please enter a message before sending.', field: 'message',
  });

  const noCategory = render({ 0: 'Map crash', 1: 'It broke', 2: 'rant' });
  await noCategory.submit();
  expect(noCategory.setState()).toHaveBeenCalledWith({
    kind: 'error', message: 'Please choose a category before sending.',
  });

  const busy = render({ 0: 'Map crash', 1: 'It broke', 4: { kind: 'submitting' } });
  await busy.submit();
  expect(busy.setState()).not.toHaveBeenCalled();
  expect(api.apiFetch).not.toHaveBeenCalled();

  // The title error shows on the title field, not the message.
  const titleError = render({ 4: { kind: 'error', message: 'Need a title', field: 'title' } });
  expect(findByName(titleError.dialog, 'FeedbackTitleField')?.props.error).toBe('Need a title');
});

test('a valid submission sends the page path and reports success, server refusals, and network failure', async () => {
  vi.stubGlobal('window', { location: { pathname: '/map/7', search: '?tab=sigs' } });
  api.apiFetch.mockResolvedValueOnce({ ok: true, data: {} });
  const sent = render({ 0: 'Map crash', 1: 'It broke', 2: 'feature' });
  await sent.submit();
  expect(api.apiFetch.mock.calls[0]?.[1]).toEqual({
    body: { title: 'Map crash', message: 'It broke', path: '/map/7?tab=sigs', category: 'feature' },
  });
  expect(sent.setState().mock.calls).toEqual([[{ kind: 'submitting' }], [{ kind: 'success' }]]);
  vi.unstubAllGlobals();

  api.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'api', status: 429, error: {} });
  const limited = render({ 0: 'Map crash', 1: 'It broke' });
  await limited.submit();
  expect(limited.setState()).toHaveBeenLastCalledWith({
    kind: 'error', message: 'Too much feedback too fast — please wait a minute and try again.',
  });

  api.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'network', aborted: false, cause: new Error('offline') });
  const offline = render({ 0: 'Map crash', 1: 'It broke' });
  await offline.submit();
  expect(offline.setState()).toHaveBeenLastCalledWith({
    kind: 'error', message: 'Network error — your feedback did not send. Try again.',
  });

  // Closing the dialog closes the modal; opening it does not.
  const onOpenChange = offline.dialog.props.onOpenChange as (next: boolean) => void;
  onOpenChange(true);
  expect(offline.onClose).not.toHaveBeenCalled();
  onOpenChange(false);
  expect(offline.onClose).toHaveBeenCalledTimes(1);
});
