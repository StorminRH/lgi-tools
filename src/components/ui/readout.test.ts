import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReadoutLine, ReadoutList, ReadoutRow } from './readout';

const LONG_VALUE = 'last attempt failed: upstream returned 503 Service Unavailable';

function classOf(html: string, marker: string): string {
  const match = new RegExp(`<span class="([^"]*)"[^>]*>${marker}`).exec(html);
  if (!match) throw new Error(`no span wraps ${marker}`);
  return match[1]!;
}

describe('ReadoutLine', () => {
  it('keeps the label column flexible and caps a long value so neither overprints the other', () => {
    expect(LONG_VALUE.length).toBeGreaterThanOrEqual(60);
    const html = renderToStaticMarkup(
      createElement(ReadoutLine, { label: 'Price cron', value: LONG_VALUE }),
    );
    const value = classOf(html, LONG_VALUE).split(' ');
    expect(value).toEqual(expect.arrayContaining(['max-w-2/3', 'wrap-anywhere', 'text-right']));
    expect(value).not.toContain('shrink-0');
    expect(value).not.toContain('whitespace-nowrap');
    expect(html).toContain('<span class="min-w-0 grow basis-1/3"><span class="block font-ui text-ui text-text wrap-break-word">Price cron');
  });

  it('starts the label at a third of the row so a long value and a trailing control cannot squeeze it to a sliver', () => {
    const html = renderToStaticMarkup(
      createElement(ReadoutLine, {
        label: 'Dead-lettered owned-data refreshes for characters without a valid token',
        value: '3 dead · 12 queued',
        trailing: createElement('button', { type: 'button' }, 'Open'),
      }),
    );
    const label = /<span class="([^"]*)"><span class="block font-ui/.exec(html)![1]!.split(' ');
    expect(label).toEqual(expect.arrayContaining(['min-w-0', 'grow', 'basis-1/3']));
    expect(label).not.toContain('shrink-0');
    expect(html).toContain('<span class="flex h-lh shrink-0 items-center text-ui"><button type="button">Open</button></span>');
  });

  it('wraps the note instead of truncating it', () => {
    const html = renderToStaticMarkup(
      createElement(ReadoutLine, { label: 'Error budget', note: 'floor 20 · live', value: '100 left' }),
    );
    const note = classOf(html, 'floor 20');
    expect(note).toContain('wrap-break-word');
    expect(note).not.toContain('truncate');
    expect(note).toContain('font-data text-micro text-muted');
  });

  it('centres the dot in a box one label line tall and reads the verdict to screen readers', () => {
    const html = renderToStaticMarkup(
      createElement(ReadoutLine, { label: 'SDE cron', note: 'two lines', tone: 'red', status: 'Failing', value: 'never ran' }),
    );
    expect(html).toMatch(
      /^<span class="flex min-w-0 flex-1 items-start gap-3"><span class="flex h-lh shrink-0 items-center text-ui"><span aria-hidden="true" class="[^"]*size-2[^"]*"><\/span><span class="sr-only">Failing<\/span><\/span>/,
    );
    expect(html).not.toContain('mt-1.5');
  });

  it('still announces a status when no dot is drawn', () => {
    const html = renderToStaticMarkup(createElement(ReadoutLine, { label: 'Queue', status: 'Idle' }));
    expect(html).toContain('<span class="sr-only">Idle</span>');
    expect(html).not.toContain('aria-hidden');
  });

  it('colours the value by tone, neutral-bright by default', () => {
    const tones = { default: 'text-name', muted: 'text-muted', orange: 'text-tone-orange', red: 'text-tone-red' } as const;
    for (const [valueTone, token] of Object.entries(tones)) {
      const html = renderToStaticMarkup(
        createElement(ReadoutLine, { label: 'x', value: 'v', valueTone: valueTone as keyof typeof tones }),
      );
      expect(classOf(html, 'v')).toContain(token);
    }
    expect(classOf(renderToStaticMarkup(createElement(ReadoutLine, { label: 'x', value: 'v' })), 'v')).toContain('text-name');
  });

  it('puts the trailing slot on the first line and omits empty columns', () => {
    const html = renderToStaticMarkup(createElement(ReadoutLine, { label: 'Only', trailing: '▾' }));
    expect(html).toContain('<span class="flex h-lh shrink-0 items-center text-ui">▾</span>');
    expect(html).not.toContain('max-w-2/3');
    expect(html).not.toContain('text-micro');
  });

  it('uses only phrasing elements so it can sit inside a summary', () => {
    const html = renderToStaticMarkup(
      createElement(ReadoutLine, { label: 'a', note: 'b', value: 'c', tone: 'green', status: 'OK', trailing: 'd' }),
    );
    expect(html.match(/<(\w+)/g)?.every((tag) => tag === '<span')).toBe(true);
  });
});

describe('ReadoutRow and ReadoutList', () => {
  it('render a list of padded, divided rows', () => {
    const html = renderToStaticMarkup(
      createElement(
        ReadoutList,
        null,
        createElement(ReadoutRow, { key: 'a', label: 'Mutations', value: 'no data', valueTone: 'muted' }),
        createElement(ReadoutRow, { key: 'b', label: 'Latest release', value: 'v4.2.1' }),
      ),
    );
    expect(html.startsWith('<ul><li class="border-b border-border-soft px-3.5 py-2.5 last:border-b-0">')).toBe(true);
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html).toContain('Latest release');
  });
});
