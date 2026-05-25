import { describe, expect, it } from 'vitest';
import { parseChangelog } from './parse';

describe('parseChangelog', () => {
  it('returns [] for empty input', () => {
    expect(parseChangelog('')).toEqual([]);
  });

  it('parses a single entry with a single bullet', () => {
    const md = `### 2026-05-25\n- Added a thing.`;
    expect(parseChangelog(md)).toEqual([{ date: '2026-05-25', items: ['Added a thing.'] }]);
  });

  it('parses multiple entries in source order', () => {
    const md = [
      '### 2026-05-25',
      '- newer A',
      '- newer B',
      '',
      '### 2026-05-23',
      '- older C',
    ].join('\n');
    expect(parseChangelog(md)).toEqual([
      { date: '2026-05-25', items: ['newer A', 'newer B'] },
      { date: '2026-05-23', items: ['older C'] },
    ]);
  });

  it('ignores blank lines and prose between entries', () => {
    const md = [
      '# Changelog',
      '',
      'Some prose here that should be ignored.',
      '',
      '### 2026-05-25',
      '- One',
      '',
      'More prose.',
      '- Two',
    ].join('\n');
    expect(parseChangelog(md)).toEqual([
      { date: '2026-05-25', items: ['One', 'Two'] },
    ]);
  });

  it('ignores bullets that appear before any date heading', () => {
    const md = ['- orphan bullet', '- another orphan', '### 2026-05-25', '- real one'].join('\n');
    expect(parseChangelog(md)).toEqual([
      { date: '2026-05-25', items: ['real one'] },
    ]);
  });

  it('returns [] for input that has no date headings', () => {
    expect(parseChangelog('# Just a title\n\nSome words.\n- a stray bullet')).toEqual([]);
  });
});
