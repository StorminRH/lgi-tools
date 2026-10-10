import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ChipToggle, ChipToggleGroup, ToggleRow } from './chip-toggle';

function buttonClasses(html: string, label: string): { pressed: string; classes: string[] } {
  const button = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].find(
    ([, , text]) => text === label,
  );
  if (!button) throw new Error(`no button labelled ${label}`);
  const attrs = button[1] ?? '';
  return {
    pressed: attrs.match(/aria-pressed="([^"]+)"/)?.[1] ?? '',
    classes: (attrs.match(/class="([^"]+)"/)?.[1] ?? '').split(' '),
  };
}

it('groups chips as a named multiple-value control', () => {
  const onValueChange = vi.fn();
  const el = ChipToggleGroup({
    value: ['c1'],
    onValueChange,
    label: 'Wormhole classes',
    children: 'child',
  });
  expect(el.props.multiple).toBe(true);
  expect(el.props['aria-label']).toBe('Wormhole classes');
  expect(el.props.onValueChange).toBe(onValueChange);
});

it('tints a pressed chip in its Pill tone and fades an unpressed one', () => {
  const html = renderToStaticMarkup(
    ChipToggleGroup({
      value: ['c2'],
      onValueChange: vi.fn(),
      label: 'Wormhole classes',
      children: createElement(
        Fragment,
        null,
        ChipToggle({ value: 'c2', tone: 'green-strong', className: 'w-full px-2 py-1.5', children: 'C2' }),
        ChipToggle({ value: 'c5', tone: 'red', children: 'C5' }),
      ),
    }),
  );

  const pressed = buttonClasses(html, 'C2');
  expect(pressed.pressed).toBe('true');
  expect(pressed.classes).toEqual(
    expect.arrayContaining([
      'pill-soft',
      '[--pill-tone:var(--color-tone-green-strong)]',
      'text-tone-green-strong',
      'rounded-full',
      'text-ui',
      'chip-toggle',
      'w-full',
      'px-2',
      'py-1.5',
    ]),
  );
  expect(pressed.classes).not.toContain('px-[9px]');
  expect(pressed.classes).not.toContain('py-[2px]');
  expect(pressed.classes).not.toContain('[--pill-tone:var(--color-faint)]');
  expect(pressed.classes).not.toContain('text-muted');

  const unpressed = buttonClasses(html, 'C5');
  expect(unpressed.pressed).toBe('false');
  expect(unpressed.classes).toEqual(
    expect.arrayContaining([
      'pill-soft',
      'px-[9px]',
      'py-[2px]',
      '[--pill-tone:var(--color-faint)]',
      'text-muted',
      'hover:text-name',
      'chip-toggle',
    ]),
  );
  expect(unpressed.classes).not.toContain('[--pill-tone:var(--color-alert-red)]');
  expect(unpressed.classes).not.toContain('text-pill-red-text');
});

it('fills a pressed row toggle and leaves an unpressed one untinted', () => {
  const html = renderToStaticMarkup(
    ChipToggleGroup({
      value: ['combat'],
      onValueChange: vi.fn(),
      label: 'Filter by site type',
      children: createElement(
        Fragment,
        null,
        ToggleRow({ value: 'combat', className: 'w-full gap-2', children: 'Combat' }),
        ToggleRow({ value: 'data', children: 'Data' }),
      ),
    }),
  );

  const pressed = buttonClasses(html, 'Combat');
  expect(pressed.pressed).toBe('true');
  expect(pressed.classes).toEqual(
    expect.arrayContaining(['bg-row-sites-on', 'text-name', 'chip-toggle', 'w-full', 'gap-2']),
  );
  expect(pressed.classes).not.toContain('text-muted');

  const unpressed = buttonClasses(html, 'Data');
  expect(unpressed.pressed).toBe('false');
  expect(unpressed.classes).toEqual(
    expect.arrayContaining(['text-muted', 'hover:bg-row-sites-hover', 'chip-toggle']),
  );
  expect(unpressed.classes).not.toContain('bg-row-sites-on');
  expect(unpressed.classes.some((cls) => cls.startsWith('[--pill-tone:'))).toBe(false);
});
