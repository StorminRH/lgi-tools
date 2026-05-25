import { describe, expect, it } from 'vitest';
import {
  formatTerminalQuery,
  parseTerminalQuery,
  suggestTerminalQuery,
  terminalErrorMessage,
} from './terminal-query';

describe('parseTerminalQuery', () => {
  it('treats empty input as the `empty` error (UI uses this as a clear signal, not a display error)', () => {
    expect(parseTerminalQuery('')).toEqual({ ok: false, error: { kind: 'empty' } });
    expect(parseTerminalQuery('   ')).toEqual({ ok: false, error: { kind: 'empty' } });
  });

  it('parses each single type token', () => {
    for (const t of ['combat', 'ore', 'gas', 'relic', 'data'] as const) {
      expect(parseTerminalQuery(t)).toEqual({ ok: true, params: { type: t } });
    }
  });

  it('parses each single class token', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const result = parseTerminalQuery(`c${n}`);
      expect(result).toEqual({ ok: true, params: { wormholeClass: `C${n}` } });
    }
  });

  it('parses class/type order', () => {
    expect(parseTerminalQuery('c2/combat')).toEqual({
      ok: true,
      params: { wormholeClass: 'C2', type: 'combat' },
    });
  });

  it('parses type/class order (order-agnostic)', () => {
    expect(parseTerminalQuery('combat/c2')).toEqual({
      ok: true,
      params: { wormholeClass: 'C2', type: 'combat' },
    });
  });

  it('is case-insensitive', () => {
    expect(parseTerminalQuery('C2/COMBAT')).toEqual({
      ok: true,
      params: { wormholeClass: 'C2', type: 'combat' },
    });
    expect(parseTerminalQuery('Combat')).toEqual({ ok: true, params: { type: 'combat' } });
  });

  it('tolerates whitespace around tokens', () => {
    expect(parseTerminalQuery('  c2 / combat  ')).toEqual({
      ok: true,
      params: { wormholeClass: 'C2', type: 'combat' },
    });
  });

  it('rejects unknown tokens', () => {
    expect(parseTerminalQuery('xyz')).toEqual({
      ok: false,
      error: { kind: 'unknown_token', token: 'xyz' },
    });
  });

  it('rejects out-of-range class tokens', () => {
    expect(parseTerminalQuery('c7')).toEqual({
      ok: false,
      error: { kind: 'unknown_token', token: 'c7' },
    });
    expect(parseTerminalQuery('c0')).toEqual({
      ok: false,
      error: { kind: 'unknown_token', token: 'c0' },
    });
  });

  it('rejects two type tokens', () => {
    expect(parseTerminalQuery('combat/relic')).toEqual({
      ok: false,
      error: { kind: 'duplicate_type', tokens: ['combat', 'relic'] },
    });
  });

  it('rejects two class tokens', () => {
    expect(parseTerminalQuery('c2/c3')).toEqual({
      ok: false,
      error: { kind: 'duplicate_class', tokens: ['c2', 'c3'] },
    });
  });

  it('rejects three or more tokens', () => {
    const r = parseTerminalQuery('c2/combat/relic');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('too_many_tokens');
  });
});

describe('formatTerminalQuery', () => {
  it('round-trips a class/type pair to canonical class-first form', () => {
    expect(formatTerminalQuery({ wormholeClass: 'C2', type: 'combat' })).toBe('c2/combat');
  });

  it('renders a single class', () => {
    expect(formatTerminalQuery({ wormholeClass: 'C5' })).toBe('c5');
  });

  it('renders a single type', () => {
    expect(formatTerminalQuery({ type: 'ore' })).toBe('ore');
  });

  it('renders empty params as an empty string', () => {
    expect(formatTerminalQuery({})).toBe('');
  });
});

describe('suggestTerminalQuery', () => {
  it('returns [] for empty / whitespace input', () => {
    expect(suggestTerminalQuery('')).toEqual([]);
    expect(suggestTerminalQuery('   ')).toEqual([]);
  });

  it('prefix-matches the single-token vocabulary', () => {
    // Six classes (c1-c6) plus combat — all start with "c".
    expect(suggestTerminalQuery('c').sort()).toEqual(
      ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'combat'].sort(),
    );
  });

  it('narrows the dropdown as the user types', () => {
    expect(suggestTerminalQuery('co')).toEqual(['combat']);
    expect(suggestTerminalQuery('c2')).toEqual(['c2']);
  });

  it('suggests opposite-kind second-token completions after a slash', () => {
    expect(suggestTerminalQuery('c2/').sort()).toEqual(
      ['c2/combat', 'c2/data', 'c2/gas', 'c2/ore', 'c2/relic'].sort(),
    );
    expect(suggestTerminalQuery('combat/').sort()).toEqual(
      ['combat/c1', 'combat/c2', 'combat/c3', 'combat/c4', 'combat/c5', 'combat/c6'].sort(),
    );
  });

  it('prefix-matches the second token', () => {
    expect(suggestTerminalQuery('c2/c')).toEqual(['c2/combat']);
    expect(suggestTerminalQuery('combat/c3')).toEqual(['combat/c3']);
  });

  it('returns [] when the first token is invalid (no broken left side)', () => {
    expect(suggestTerminalQuery('xyz/')).toEqual([]);
    expect(suggestTerminalQuery('xyz/c2')).toEqual([]);
  });
});

describe('terminalErrorMessage', () => {
  it('renders user-facing copy for each error kind', () => {
    expect(terminalErrorMessage({ kind: 'empty' })).toMatch(/filter/i);
    expect(terminalErrorMessage({ kind: 'unknown_token', token: 'xyz' })).toContain('"xyz"');
    expect(terminalErrorMessage({ kind: 'too_many_tokens', count: 3 })).toMatch(/two/i);
    expect(
      terminalErrorMessage({ kind: 'duplicate_type', tokens: ['combat', 'relic'] }),
    ).toContain('combat');
    expect(
      terminalErrorMessage({ kind: 'duplicate_class', tokens: ['c2', 'c3'] }),
    ).toContain('c2');
  });
});
