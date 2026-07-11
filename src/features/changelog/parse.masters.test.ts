import { describe, expect, it } from 'vitest';
import { masterVersionOf, parseChangelogMasters } from './parse';

describe('masterVersionOf', () => {
  it('keeps the first two dot-segments', () => {
    expect(masterVersionOf('3.6.28')).toBe('3.6');
    expect(masterVersionOf('2.9.1')).toBe('2.9');
  });

  it('collapses a 4-segment version to its master', () => {
    expect(masterVersionOf('3.0.3.1')).toBe('3.0');
  });

  it('returns a two-segment version unchanged', () => {
    expect(masterVersionOf('3.7')).toBe('3.7');
  });
});

describe('parseChangelogMasters', () => {
  it('returns [] for empty input', () => {
    expect(parseChangelogMasters('')).toEqual([]);
  });

  it('groups sub-versions that share a master', () => {
    const md = [
      '### v3.6.2 — 2026-06-02',
      '#### Added',
      '- newer',
      '### v3.6.1 — 2026-06-01',
      '#### Fixed',
      '- older',
    ].join('\n');
    expect(parseChangelogMasters(md)).toEqual([
      {
        version: '3.6',
        title: null,
        summary: [],
        subVersions: [
          { version: '3.6.2', date: '2026-06-02', groups: [{ type: 'Added', items: ['newer'] }] },
          { version: '3.6.1', date: '2026-06-01', groups: [{ type: 'Fixed', items: ['older'] }] },
        ],
      },
    ]);
  });

  it('splits sub-versions across masters, newest master first', () => {
    const md = [
      '### v3.6.0 — 2026-06-02',
      '#### Added',
      '- a',
      '### v3.4.0 — 2026-06-01',
      '#### Added',
      '- b',
    ].join('\n');
    expect(parseChangelogMasters(md).map((m) => m.version)).toEqual(['3.6', '3.4']);
  });

  it('attaches a themed title from a master heading, slash and all', () => {
    const md = [
      '## v3.7 — Security Improvements / Industry Planner Upgrade',
      '',
      '### v3.7.0.1 — 2026-06-24',
      '#### Changed',
      '- x',
    ].join('\n');
    const [master] = parseChangelogMasters(md);
    expect(master.version).toBe('3.7');
    expect(master.title).toBe('Security Improvements / Industry Planner Upgrade');
  });

  it('leaves a master with no heading bare', () => {
    const md = ['### v3.6.2 — 2026-06-02', '#### Added', '- a'].join('\n');
    expect(parseChangelogMasters(md)[0].title).toBeNull();
    expect(parseChangelogMasters(md)[0].summary).toEqual([]);
  });

  it('collects the prose under a master heading as its summary', () => {
    const md = [
      '## v3.7 — Themed',
      '',
      'A one-line summary of what this version did.',
      '',
      '### v3.7.0.1 — 2026-06-24',
      '#### Changed',
      '- x',
    ].join('\n');
    const [master] = parseChangelogMasters(md);
    expect(master.title).toBe('Themed');
    expect(master.summary).toEqual(['A one-line summary of what this version did.']);
  });

  it('keeps blank-separated summary paragraphs distinct and joins wrapped lines', () => {
    const md = [
      '## v3.6 — Themed',
      '',
      'First paragraph line one',
      'still first paragraph.',
      '',
      'Second paragraph.',
      '',
      '### v3.6.1 — 2026-06-01',
      '#### Added',
      '- a',
    ].join('\n');
    const [master] = parseChangelogMasters(md);
    expect(master.summary).toEqual([
      'First paragraph line one still first paragraph.',
      'Second paragraph.',
    ]);
  });

  it('does not treat prose after the first entry as summary', () => {
    const md = [
      '## v3.6 — Themed',
      '',
      '### v3.6.1 — 2026-06-01',
      '#### Added',
      '- a',
      'stray prose after an entry is ignored',
    ].join('\n');
    expect(parseChangelogMasters(md)[0].summary).toEqual([]);
  });

  it('orders sub-versions newest-first within a master', () => {
    const md = [
      '### v3.6.2 — 2026-06-03',
      '#### Added',
      '- c',
      '### v3.6.1 — 2026-06-02',
      '#### Added',
      '- b',
      '### v3.6.0 — 2026-06-01',
      '#### Added',
      '- a',
    ].join('\n');
    expect(parseChangelogMasters(md)[0].subVersions.map((s) => s.version)).toEqual([
      '3.6.2',
      '3.6.1',
      '3.6.0',
    ]);
  });

  it('ignores a themed heading with no matching sub-versions', () => {
    const md = [
      '## v9.9 — Ghost release',
      '### v3.6.0 — 2026-06-01',
      '#### Added',
      '- a',
    ].join('\n');
    expect(parseChangelogMasters(md).map((m) => m.version)).toEqual(['3.6']);
  });

  it('merges an out-of-order entry into its existing master without duplicating it', () => {
    const md = [
      '### v3.6.2 — 2026-06-03',
      '#### Added',
      '- a',
      '### v3.4.1 — 2026-06-02',
      '#### Added',
      '- b',
      '### v3.6.0 — 2026-06-01',
      '#### Added',
      '- c',
    ].join('\n');
    const masters = parseChangelogMasters(md);
    expect(masters.map((m) => m.version)).toEqual(['3.6', '3.4']);
    expect(masters[0].subVersions.map((s) => s.version)).toEqual(['3.6.2', '3.6.0']);
  });

  it('groups a 4-segment sub-version under its two-segment master', () => {
    const md = [
      '### v3.0.10 — 2026-05-30',
      '#### Added',
      '- a',
      '### v3.0.3.1 — 2026-05-27',
      '#### Added',
      '- b',
    ].join('\n');
    const masters = parseChangelogMasters(md);
    expect(masters.map((m) => m.version)).toEqual(['3.0']);
    expect(masters[0].subVersions.map((s) => s.version)).toEqual(['3.0.10', '3.0.3.1']);
  });
});
