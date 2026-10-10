import { isValidElement, type ReactElement } from 'react';
import { expect, test, vi } from 'vitest';
import * as Combobox from '@/components/ui/combobox';
import { searchCharactersEndpoint } from '@/data/maps/api-contract';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
// The control runs on a minimal hook store so the combobox handlers can be
// driven directly: each render re-reads the state its last handlers wrote.
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...rt.react,
  useId: () => 'character-search',
}));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

import { CharacterSearchControl } from './CharacterSearchControl';

type Props = Record<string, unknown> & { children?: unknown };
type Handler = (...args: never[]) => unknown;

function* elements(node: unknown): Generator<ReactElement<Props>> {
  if (Array.isArray(node)) {
    for (const child of node) yield* elements(child);
    return;
  }
  if (!isValidElement<Props>(node)) return;
  yield node;
  yield* elements(node.props.children);
}

function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return isValidElement<Props>(node) ? textOf(node.props.children) : '';
}

const PILOT = { characterId: 90000001, name: 'Pilot One', portraitUrl: 'https://images.evetech.net/characters/90000001/portrait' };

test('a picked character is handed back, and the field clears without searching for it', async () => {
  vi.useFakeTimers();
  rt.unmount();
  h.apiFetch.mockResolvedValue({ ok: true, data: { mode: 'typeahead', results: [PILOT] } });
  const onSelect = vi.fn();
  const render = () =>
    [...elements(rt.render(CharacterSearchControl, { selectedPrincipals: [], onSelect }))];
  const root = () => render().find((node) => node.type === Combobox.Root)!.props;
  const type = (text: string) =>
    (root().onValueChange as Handler)(...([text, { reason: 'input-change' }] as never[]));
  // What Base UI does on a press: the item's own click handler, then the commit
  // that fills the input with the item's string value, then the close.
  const press = (name: string) => {
    const props = root();
    const item = render().find((node) => node.type === Combobox.Item && textOf(node) === name)!.props;
    (item.onClick as Handler | undefined)?.();
    const toString = props.itemToStringValue as ((value: unknown) => string) | undefined;
    const filled = toString ? toString(item.value) : String(item.value);
    (props.onValueChange as Handler)(...([filled, { reason: 'item-press' }] as never[]));
    (props.onOpenChange as Handler)(...([false, { reason: 'item-press' }] as never[]));
  };

  type('Pilot');
  render();
  await vi.advanceTimersByTimeAsync(300);
  expect(h.apiFetch).toHaveBeenCalledExactlyOnceWith(searchCharactersEndpoint, expect.objectContaining({ body: { search: 'Pilot' } }));
  expect(root()).toMatchObject({ value: 'Pilot', open: true });

  press('Pilot One');
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({
    ownerType: 'character',
    ownerId: PILOT.characterId,
    name: PILOT.name,
    imageUrl: PILOT.portraitUrl,
  });
  expect(root()).toMatchObject({ value: '', open: false });
  await vi.advanceTimersByTimeAsync(300);
  expect(h.apiFetch).toHaveBeenCalledOnce();
  vi.useRealTimers();
});
