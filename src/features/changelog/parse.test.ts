import { describe, expect, it } from 'vitest';
import { parseChangelog } from './parse';

describe('parseChangelog', () => {
  it('returns [] for empty input', () => {
    expect(parseChangelog('')).toEqual([]);
  });

  it('parses a single entry with one group and bullet', () => {
    const md = ['### v3.7.0 — 2026-05-25', '', '#### Added', '- Added a thing.'].join('\n');
    expect(parseChangelog(md)).toEqual([
      { version: '3.7.0', date: '2026-05-25', groups: [{ type: 'Added', items: ['Added a thing.'] }] },
    ]);
  });

  it('parses multiple groups within an entry', () => {
    const md = [
      '### v3.7.0 — 2026-05-25',
      '#### Added',
      '- new A',
      '- new B',
      '#### Removed',
      '- gone C',
    ].join('\n');
    expect(parseChangelog(md)).toEqual([
      {
        version: '3.7.0',
        date: '2026-05-25',
        groups: [
          { type: 'Added', items: ['new A', 'new B'] },
          { type: 'Removed', items: ['gone C'] },
        ],
      },
    ]);
  });

  it('parses multiple entries in source order', () => {
    const md = [
      '### v3.7.0 — 2026-05-25',
      '#### Changed',
      '- newer',
      '',
      '### v3.6.0 — 2026-05-23',
      '#### Fixed',
      '- older',
    ].join('\n');
    expect(parseChangelog(md)).toEqual([
      { version: '3.7.0', date: '2026-05-25', groups: [{ type: 'Changed', items: ['newer'] }] },
      { version: '3.6.0', date: '2026-05-23', groups: [{ type: 'Fixed', items: ['older'] }] },
    ]);
  });

  it('accepts multi-segment versions and a hyphen separator', () => {
    const md = ['### v3.0.3.1 - 2026-05-27', '#### Added', '- thing'].join('\n');
    expect(parseChangelog(md)).toEqual([
      { version: '3.0.3.1', date: '2026-05-27', groups: [{ type: 'Added', items: ['thing'] }] },
    ]);
  });

  it('ignores prose and bullets that appear before any group', () => {
    const md = [
      '# Changelog',
      'Some prose to ignore.',
      '- orphan bullet before any entry',
      '### v3.7.0 — 2026-05-25',
      '- orphan bullet before any group',
      '#### Added',
      '- real one',
    ].join('\n');
    expect(parseChangelog(md)).toEqual([
      { version: '3.7.0', date: '2026-05-25', groups: [{ type: 'Added', items: ['real one'] }] },
    ]);
  });

  it('returns [] for input that has no entry headings', () => {
    expect(parseChangelog('# Just a title\n\nSome words.\n- a stray bullet')).toEqual([]);
  });
});
