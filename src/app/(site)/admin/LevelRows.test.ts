import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LevelRows } from './LevelRows';
import type { StatusLine } from './signals';

function render(line: StatusLine): string {
  return renderToStaticMarkup(createElement(LevelRows, { lines: [line] }));
}

describe('LevelRows', () => {
  it('says the verdict in words beside the dot', () => {
    const html = render({ id: 'cron', label: 'Price cron', value: 'failing', note: 'failed 3h ago', level: 'red' });

    expect(html).toMatch(/^<ul><li /);
    expect(html).toContain('<span aria-hidden="true" class="inline-block rounded-full');
    expect(html).toContain('<span class="sr-only">Critical</span>');
    expect(html).toContain('text-tone-red">failing</span>');
    expect(html).toContain('>failed 3h ago</span>');
  });

  // StorminRH/lgi-tools#644: the value column never shrank, so a long value
  // printed over its label. The value now sits in its own capped column.
  it('keeps a long status value in the value column, clear of the label', () => {
    const value = 'recovered after 14 failed runs across three regions overnight';
    const html = render({ id: 'cron', label: 'Housekeeping', value, level: 'amber' });

    expect(html).toContain(`<span class="block font-ui text-ui text-text wrap-break-word">Housekeeping</span>`);
    expect(html).toContain(
      `<span class="max-w-2/3 text-right font-data text-ui tabular-nums wrap-anywhere text-tone-orange">${value}</span>`,
    );
    expect(html).not.toContain('shrink-0 text-right');
  });

  it('draws no note line when the status has nothing to add', () => {
    const html = render({ id: 'queue', label: 'Held for budget', value: '0 jobs', level: 'green' });

    expect(html).not.toContain('text-micro');
    expect(html).toContain('<span class="sr-only">Healthy</span>');
    expect(html).toContain('text-name">0 jobs</span>');
  });
});
