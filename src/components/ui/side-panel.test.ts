import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('./__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});

import { dialogProbe } from './__tests__/static-base-dialog';
import { SidePanel } from './side-panel';

test('side panel stays mounted, forwards open, and labels itself from its title', () => {
  const onOpenChange = vi.fn();
  const finalFocus = { current: null };
  const props = {
    open: true,
    onOpenChange,
    finalFocus,
    title: 'Custom structures',
    children: createElement('input', { defaultValue: 'Unsaved fitting' }),
  };
  const html = renderToStaticMarkup(createElement(SidePanel, props));

  expect(dialogProbe.root).toMatchObject({ open: true });
  expect(dialogProbe.portal?.keepMounted).toBe(true);
  expect(dialogProbe.popup?.finalFocus).toBe(finalFocus);
  dialogProbe.root?.onOpenChange?.(false);
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(html).toContain('value="Unsaved fitting"');
  expect(html).toMatch(/<button type="button" aria-label="Close side panel"><svg aria-hidden="true"/);
  const label = html.match(/<div role="dialog" aria-labelledby="([^"]+)"/)?.[1];
  expect(label).toBeTruthy();
  expect(html.match(/<h2 id="([^"]+)"/)?.[1]).toBe(label);
  expect(html).toContain('>Custom structures</h2>');

  renderToStaticMarkup(createElement(SidePanel, { ...props, open: false }));
  expect(dialogProbe.root).toMatchObject({ open: false });
  expect(dialogProbe.portal?.keepMounted).toBe(true);
  expect(dialogProbe.popup?.finalFocus).toBe(finalFocus);
});
