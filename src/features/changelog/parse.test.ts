import { describe, expect, it } from 'vitest';
import { parseChangelog } from './parse';

describe('parseChangelog', () => {
  it('parses a single entry with one group and bullet', () => {
    expect(parseChangelog('')).toEqual([]);
    expect(parseChangelog('# Just a title\n\nSome words.\n- a stray bullet')).toEqual([]);
    const md = ['### v3.7.0 — 2026-05-25', '', '#### Added', '- Added a thing.'].join('\n');
    expect(parseChangelog(md)).toEqual([
      { version: '3.7.0', date: '2026-05-25', summary: [], groups: [{ type: 'Added', items: ['Added a thing.'] }] },
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
        summary: [],
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
      { version: '3.7.0', date: '2026-05-25', summary: [], groups: [{ type: 'Changed', items: ['newer'] }] },
      { version: '3.6.0', date: '2026-05-23', summary: [], groups: [{ type: 'Fixed', items: ['older'] }] },
    ]);
  });

  it('accepts multi-segment versions and a hyphen separator', () => {
    const md = ['### v3.0.3.1 - 2026-05-27', '#### Added', '- thing'].join('\n');
    expect(parseChangelog(md)).toEqual([
      { version: '3.0.3.1', date: '2026-05-27', summary: [], groups: [{ type: 'Added', items: ['thing'] }] },
    ]);
  });

  it('collects prose between the entry heading and the first group as summary', () => {
    const md = [
      '# Changelog',
      'Some prose to ignore.',
      '- orphan bullet before any entry',
      '### v3.7.0 — 2026-05-25',
      '',
      'This version ships Atlas.',
      'More of the same paragraph.',
      '',
      'A second paragraph.',
      '- orphan bullet before any group',
      '#### Added',
      '- real one',
    ].join('\n');
    expect(parseChangelog(md)).toEqual([
      {
        version: '3.7.0',
        date: '2026-05-25',
        summary: [
          'This version ships Atlas. More of the same paragraph.',
          'A second paragraph.',
        ],
        groups: [{ type: 'Added', items: ['real one'] }],
      },
    ]);
  });

  it('flushes a summary when the next entry heading arrives without a group', () => {
    const md = [
      '### v3.7.0 — 2026-05-25',
      'Ships Atlas.',
      '### v3.6.0 — 2026-05-23',
      '#### Fixed',
      '- older',
    ].join('\n');
    expect(parseChangelog(md)).toEqual([
      { version: '3.7.0', date: '2026-05-25', summary: ['Ships Atlas.'], groups: [] },
      { version: '3.6.0', date: '2026-05-23', summary: [], groups: [{ type: 'Fixed', items: ['older'] }] },
    ]);
  });

  it('flushes a trailing summary at end of file when the entry has no group', () => {
    const md = ['### v3.7.0 — 2026-05-25', 'Ships Atlas.', 'Still the same paragraph.'].join('\n');
    expect(parseChangelog(md)).toEqual([
      {
        version: '3.7.0',
        date: '2026-05-25',
        summary: ['Ships Atlas. Still the same paragraph.'],
        groups: [],
      },
    ]);
  });

  it('rejects a calendar-invalid release date', () => {
    expect(() => parseChangelog('### v3.8.3.1 — 2026-02-30')).toThrow(
      'Changelog entry 3.8.3.1 has an invalid date: 2026-02-30',
    );
  });
});
