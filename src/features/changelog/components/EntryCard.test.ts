import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ChangelogEntry } from '../parse';
import { EntryCard } from './EntryCard';

function entry(over: Partial<ChangelogEntry> = {}): ChangelogEntry {
  return {
    version: '3.8.1',
    date: '2026-07-12',
    summary: [],
    groups: [{ type: 'Added', items: ['a thing'] }],
    ...over,
  };
}

describe('EntryCard', () => {
  it('renders overview paragraphs in order and omits summary markup when empty', () => {
    const withSummary = renderToStaticMarkup(
      createElement(EntryCard, {
        entry: entry({
          summary: ['This version ships Atlas.', 'A second paragraph.'],
        }),
      }),
    );
    expect(withSummary).toContain('v3.8.1');
    expect(withSummary).toContain('12 Jul 2026');
    expect(withSummary.indexOf('This version ships Atlas.')).toBeLessThan(
      withSummary.indexOf('A second paragraph.'),
    );
    expect(withSummary).toContain('a thing');

    const empty = renderToStaticMarkup(createElement(EntryCard, { entry: entry() }));
    expect(empty).toContain('v3.8.1');
    expect(empty).toContain('a thing');
    expect(empty).not.toContain('<p');
  });
});
