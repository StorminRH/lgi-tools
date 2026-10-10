import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { HelpPopover } from './help-popover';

type Props = Parameters<typeof HelpPopover>[0];

/** The closed popover renders only its trigger; returns that button's classes. */
function triggerClasses(props: Partial<Props> = {}): string[] {
  const html = renderToStaticMarkup(
    HelpPopover({ label: 'Fee breakdown', children: createElement('p', null, 'Body'), ...props }),
  );
  const trigger = /^<button type="button"[^>]*aria-haspopup="dialog"[^>]*aria-label="Fee breakdown"[^>]*>\?<\/button>$/.exec(html);
  expect(trigger, html).not.toBeNull();
  return /class="([^"]*)"/.exec(trigger![0])![1]!.split(' ');
}

test('HelpPopover draws a neutral (?) button named by its label', () => {
  const classes = triggerClasses();
  expect(classes).toEqual(
    expect.arrayContaining([
      'h-[15px]',
      'w-[15px]',
      'rounded-full',
      'cursor-help',
      'border-border-idle',
      'text-muted',
      'hover:border-isk-dim',
      'hover:text-isk',
    ]),
  );
  expect(classes).not.toContain('text-dps-mid');
});

test('HelpPopover turns the mark amber when something inside wants a look', () => {
  const classes = triggerClasses({ attention: true });
  expect(classes).toEqual(
    expect.arrayContaining(['h-[15px]', 'w-[15px]', 'cursor-help', 'border-dps-mid/60', 'text-dps-mid', 'hover:border-dps-mid']),
  );
  expect(classes).not.toContain('text-muted');
  expect(classes).not.toContain('hover:text-isk');
});
