import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { settle } from '@/lib/__tests__/hook-runtime';

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  busy: boolean;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
}

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());
const ui = vi.hoisted(() => ({
  toggle: null as ((checked: boolean) => void) | null,
  confirm: null as ConfirmProps | null,
  toast: { success: vi.fn(), error: vi.fn() },
}));
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));

// Keep the row's state between static renders so its callbacks drive the next one.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: rt.react.useState,
}));
vi.mock('@/transport/api-client', () => api);
vi.mock('@/components/ui/toast', () => ({ toast: ui.toast }));
// Stub only Base UI's switch so the real Switch row names it; keep its change handler to drive.
vi.mock('@base-ui/react/switch', () => ({
  Switch: {
    Root: (props: {
      checked: boolean;
      onCheckedChange: (checked: boolean) => void;
      'aria-labelledby'?: string;
    }) => {
      ui.toggle = props.onCheckedChange;
      return createElement('span', {
        role: 'switch',
        'aria-checked': props.checked,
        'aria-labelledby': props['aria-labelledby'],
      });
    },
    Thumb: () => null,
  },
}));
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: (props: ConfirmProps) => {
    ui.confirm = props;
    return props.open ? createElement('div', { role: 'dialog' }, props.title) : null;
  },
}));

import { CorpSharingCard } from './corp-sharing-card';

const corp = { corporationId: 98000001, corporationName: 'Signal Cartel', sharingEnabled: true };

function render() {
  return rt.render(
    renderToStaticMarkup,
    createElement(CorpSharingCard, { directorCorps: [corp], memberCorps: [] }),
  );
}

test('switching sharing off asks first, then stops sharing and closes once the request settles', async () => {
  let html = render();
  // The switch is named by the corporation alone; its sharing state stays out of the name.
  const nameId = /<span role="switch" aria-checked="true" aria-labelledby="([^"]+)"><\/span>/.exec(html)?.[1];
  expect(html).toContain(`<span id="${nameId}" hidden="">Signal Cartel</span><span>Signal Cartel</span>`);
  expect(html).toMatch(/>sharing on<\/span><\/label>/);
  expect(html).not.toContain('role="dialog"');

  ui.toggle?.(false);
  html = render();
  expect(api.apiFetch).not.toHaveBeenCalled();
  expect(html).toContain('<div role="dialog">Stop sharing Signal Cartel’s data?</div>');
  expect(ui.confirm).toMatchObject({ busy: false, confirmLabel: 'Stop sharing', cancelLabel: 'Keep sharing' });

  let respond: (result: unknown) => void = () => undefined;
  api.apiFetch.mockReturnValueOnce(new Promise((resolve) => { respond = resolve; }));
  ui.confirm?.onConfirm();
  render();
  expect(api.apiFetch.mock.calls[0]?.[1]).toEqual({
    body: { corporationId: 98000001, enabled: false },
    cache: 'no-store',
  });
  expect(ui.confirm).toMatchObject({ open: true, busy: true });

  respond({ ok: true, data: {} });
  await settle();
  html = render();
  expect(ui.confirm).toMatchObject({ open: false, busy: false });
  expect(html).toContain('aria-checked="false"');
  expect(html).not.toContain('role="dialog"');
  expect(ui.toast.success).toHaveBeenCalledExactlyOnceWith('Sharing off');
});
