import { describe, expect, it } from 'vitest';
import { errorVerdict, planRead } from './plan';

type Read =
  | { kind: 'fresh'; items: number[] }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

const project = (fresh: { items: number[] }): { rows: number[] } | null =>
  fresh.items.length === 0 ? null : { rows: fresh.items };

describe('planRead', () => {
  it('stamps on an unchanged (304) read', () => {
    expect(planRead<Read, { rows: number[] }>({ kind: 'unchanged' }, project)).toEqual({ kind: 'stamp' });
  });

  it('skips on an error by default', () => {
    expect(planRead<Read, { rows: number[] }>({ kind: 'error', code: 'esi_500' }, project)).toEqual({ kind: 'skip', code: 'esi_500' });
  });

  it.each([
    ['maps a 403 to needs_role for every planner', 'esi_403', { kind: 'needs_role' }],
    ['preserves a non-role error code', 'esi_500', { kind: 'skip', code: 'esi_500' }],
  ] as const)('%s', (_label, code, expected) => {
    expect(planRead<Read, { rows: number[] }>({ kind: 'error', code }, project)).toEqual(expected);
    expect(errorVerdict(code)).toEqual(expected);
  });

  it('skips a fresh body that fails projection (contract mismatch)', () => {
    expect(planRead<Read, { rows: number[] }>({ kind: 'fresh', items: [] }, project)).toEqual({ kind: 'skip', code: 'contract_error' });
  });

  it('saves the projected payload on a fresh body', () => {
    expect(planRead<Read, { rows: number[] }>({ kind: 'fresh', items: [1, 2] }, project)).toEqual({
      kind: 'save',
      rows: [1, 2],
    });
  });
});
