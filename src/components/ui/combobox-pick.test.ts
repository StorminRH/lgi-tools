import { expect, test, vi } from 'vitest';
import { pickOrType } from './combobox-pick';

const ROWS = new Map([
  ['30002537', { id: 30002537, name: 'Amamake' }],
  ['30004759', { id: 30004759, name: '1DQ1-A' }],
]);

test('a pressed item the lookup knows is a pick, and everything else is typing', () => {
  const onType = vi.fn();
  const onPick = vi.fn();
  const route = { lookup: (key: string) => ROWS.get(key), onType, onPick };

  pickOrType('30004759', { reason: 'item-press' }, route);
  expect(onPick).toHaveBeenCalledExactlyOnceWith({ id: 30004759, name: '1DQ1-A' });
  expect(onType).not.toHaveBeenCalled();

  // Typing that happens to match a key is still typing.
  pickOrType('30002537', { reason: 'input-change' }, route);
  expect(onType).toHaveBeenCalledExactlyOnceWith('30002537');
  expect(onPick).toHaveBeenCalledOnce();

  // A press whose value the lookup does not know falls back to typing.
  pickOrType('Jita', { reason: 'item-press' }, route);
  expect(onType).toHaveBeenLastCalledWith('Jita');
  pickOrType('', { reason: 'input-clear' }, route);
  expect(onType).toHaveBeenLastCalledWith('');
  expect(onType).toHaveBeenCalledTimes(3);
  expect(onPick).toHaveBeenCalledOnce();
});

test('without a lookup every pressed value is the pick, even an empty one', () => {
  const onType = vi.fn();
  const onPick = vi.fn();
  const route = { onType, onPick };

  pickOrType('', { reason: 'item-press' }, route);
  pickOrType('C247', { reason: 'item-press' }, route);
  expect(onPick.mock.calls).toEqual([[''], ['C247']]);
  expect(onType).not.toHaveBeenCalled();
  pickOrType('C2', { reason: 'input-change' }, route);
  expect(onType).toHaveBeenCalledExactlyOnceWith('C2');
  expect(onPick).toHaveBeenCalledTimes(2);
});
