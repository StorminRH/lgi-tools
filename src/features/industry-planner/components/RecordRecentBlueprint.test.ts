import { expect, test, vi } from 'vitest';

const record = vi.hoisted(() => vi.fn());
vi.mock('react', () => ({ useEffect: (effect: () => void) => effect() }));
vi.mock('../recent-blueprints', () => ({ recordRecentBlueprint: record }));

const { RecordRecentBlueprint } = await import('./RecordRecentBlueprint');

test('opening a blueprint records it as this device’s most recent, and renders nothing', () => {
  expect(RecordRecentBlueprint({ typeId: 2047, productTypeId: 2046, name: 'Damage Control I' })).toBeNull();
  expect(record).toHaveBeenCalledWith({ typeId: 2047, productTypeId: 2046, name: 'Damage Control I' });
});
