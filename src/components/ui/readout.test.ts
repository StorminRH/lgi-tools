import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ReadoutLine, ReadoutList, ReadoutRow } from './readout';

const LONG_VALUE = 'last attempt failed: upstream returned 503 Service Unavailable';

function classOf(html: string, marker: string): string {
  const match = new RegExp(`<span class="([^"]*)"[^>]*>${marker}`).exec(html);
  if (!match) throw new Error(`no span wraps ${marker}`);
  return match[1]!;
}

test('keeps the label column flexible and caps a long value so neither overprints the other', () => {
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

test('reads the verdict to screen readers with or without a dot, and colours only a problem value', () => {
  const dotted = renderToStaticMarkup(
    createElement(ReadoutLine, { label: 'SDE cron', tone: 'red', status: 'Failing', value: 'never ran', valueTone: 'red' }),
  );
  expect(dotted).toMatch(/<span aria-hidden="true" [^>]*><\/span><span class="sr-only">Failing<\/span>/);
  expect(classOf(dotted, 'never ran')).toContain('text-tone-red');

  const undotted = renderToStaticMarkup(createElement(ReadoutLine, { label: 'Queue', status: 'Idle', value: '0' }));
  expect(undotted).toContain('<span class="sr-only">Idle</span>');
  expect(undotted).not.toContain('aria-hidden');
  expect(classOf(undotted, '0')).toContain('text-name');
});

test('uses only phrasing elements so it can sit inside a summary, and omits empty columns', () => {
  const html = renderToStaticMarkup(
    createElement(ReadoutLine, { label: 'a', note: 'b', value: 'c', tone: 'green', status: 'OK', trailing: 'd' }),
  );
  expect(html.match(/<(\w+)/g)?.every((tag) => tag === '<span')).toBe(true);

  const only = renderToStaticMarkup(createElement(ReadoutLine, { label: 'Only', trailing: '▾' }));
  expect(only.match(/<span/g)).toHaveLength(html.match(/<span/g)!.length - 5);
  expect(only.indexOf('Only')).toBeLessThan(only.indexOf('▾'));
});

test('ReadoutList renders one list item per ReadoutRow', () => {
  const html = renderToStaticMarkup(
    createElement(
      ReadoutList,
      null,
      createElement(ReadoutRow, { key: 'a', label: 'Mutations', value: 'no data', valueTone: 'muted' }),
      createElement(ReadoutRow, { key: 'b', label: 'Latest release', value: 'v4.2.1' }),
    ),
  );
  expect(html).toMatch(/^<ul><li [^>]*><span/);
  expect(html.match(/<li /g)).toHaveLength(2);
  expect(html).toContain('Latest release');
});
