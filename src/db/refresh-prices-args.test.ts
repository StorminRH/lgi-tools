import { describe, expect, it } from 'vitest';
import { DEFAULT_DEBUG_IDS, parseArgs, parseIds } from './refresh-prices-args';

describe('parseIds', () => {
  it('parses a comma list, trimming whitespace', () => {
    expect(parseIds('34, 35 ,36')).toEqual([34, 35, 36]);
  });

  it('throws on a non-numeric entry', () => {
    expect(() => parseIds('34,abc')).toThrow('Invalid type ID: "abc"');
  });

  it('throws when no ids survive filtering', () => {
    expect(() => parseIds(' , , ')).toThrow('No type IDs supplied');
  });
});

describe('parseArgs', () => {
  it('is a stale sweep with no args', () => {
    expect(parseArgs([])).toEqual({ kind: 'cached' });
  });

  it('reads explicit ids from a positional arg', () => {
    expect(parseArgs(['34,35'])).toEqual({ kind: 'explicit', ids: [34, 35] });
  });

  it('uses the debug trio for --debug', () => {
    expect(parseArgs(['--debug'])).toEqual({ kind: 'explicit', ids: DEFAULT_DEBUG_IDS });
  });

  it('prefers explicit ids over --debug when both are present', () => {
    expect(parseArgs(['--debug', '99'])).toEqual({ kind: 'explicit', ids: [99] });
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['--nope'])).toThrow('Unknown flag: --nope');
  });
});
