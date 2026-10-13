import { expect, test, vi } from 'vitest';
import { fakeQuerySelector, keyDown, type FakeElement } from '@/components/ui/__tests__/fake-page';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...rt.react,
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('character=7') }));

import { focusedView } from './board-view-model';
import { useFocusView } from './use-focus-view';

test('Escape closes the sheet unless a popup is open; a dialog playing its exit animation no longer holds it', () => {
  const page: FakeElement[] = [];
  // The sheet was opened from the overview, so closing it steps back in history.
  const window = Object.assign(new EventTarget(), {
    location: { pathname: '/', search: '?character=7' },
    history: { state: { lgiBoardFocused: true }, back: vi.fn() },
  });
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { querySelector: fakeQuerySelector(page) }));
  try {
    const { view } = rt.render(useFocusView, (param) => focusedView(param, () => true), 'data-pilot-id');
    expect(view).toEqual({ view: 'character', characterId: 7 });

    // An open menu on the sheet owns Escape: it closes first, the sheet stays.
    page.push({ attributes: { role: 'menu', 'data-open': '' } });
    window.dispatchEvent(keyDown('Escape'));
    expect(window.history.back).not.toHaveBeenCalled();

    // A dialog still mounted for its exit animation has lost data-open, so the
    // next Escape is the sheet's.
    page.length = 0;
    page.push({ attributes: { role: 'dialog', 'data-closed': '' } });
    window.dispatchEvent(keyDown('Escape'));
    expect(window.history.back).toHaveBeenCalledTimes(1);
  } finally {
    rt.unmount();
    vi.unstubAllGlobals();
  }
});
