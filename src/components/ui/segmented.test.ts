import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented';

const ACTIVE_FILL = ['border-border-active', 'bg-row-on', 'text-isk', 'shadow-card-edge'];

function segmentClasses(html: string, tag: 'a' | 'button', label: string): string[] {
  const segment = [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([^<]*)</${tag}>`, 'g'))].find(
    ([, , text]) => text === label,
  );
  return (segment?.[1]?.match(/class="([^"]+)"/)?.[1] ?? '').split(' ');
}

it('raises the selected segment with the active fill in toggle and link modes', () => {
  const toggles = renderToStaticMarkup(
    createElement(SegmentedControl, {
      label: 'Display unit',
      value: 'volume',
      onChange: vi.fn(),
      options: [
        { value: 'isk', label: 'ISK' },
        { value: 'volume', label: 'm3' },
      ],
    }),
  );
  expect(toggles).toContain('aria-label="Display unit"');
  const pressed = segmentClasses(toggles, 'button', 'm3');
  expect(pressed).toEqual(expect.arrayContaining([...ACTIVE_FILL, 'px-3', 'text-nav']));
  expect(pressed).not.toContain('text-muted');
  const idle = segmentClasses(toggles, 'button', 'ISK');
  expect(idle).toEqual(expect.arrayContaining(['border-transparent', 'text-muted', 'hover:text-text']));
  expect(idle).not.toContain('text-isk');

  const links = renderToStaticMarkup(
    createElement(SegmentedControl, {
      label: 'Reference sections',
      value: 'tags',
      density: 'compact',
      options: [
        { value: 'forms', label: 'Forms', href: '#forms' },
        { value: 'tags', label: 'Tags', href: '#tags' },
      ],
    }),
  );
  expect(links).toContain('aria-current="page"');
  const current = segmentClasses(links, 'a', 'Tags');
  expect(current).toEqual(expect.arrayContaining([...ACTIVE_FILL, 'px-2', 'text-label']));
  expect(current).not.toContain('text-muted');
  const other = segmentClasses(links, 'a', 'Forms');
  expect(other).toEqual(expect.arrayContaining(['text-muted', 'hover:text-text']));
  expect(other).not.toContain('bg-row-on');
});
