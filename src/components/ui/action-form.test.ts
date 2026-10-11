import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ActionForm } from './action-form';
import { Button } from './button';

type Props = ComponentProps<typeof ActionForm>;

it('posts its defined fields in key order and leaves undefined ones out', () => {
  const props: Props = {
    action: '/api/admin/role',
    fields: { userId: 'user-1', q: undefined, nextRole: 'ADMIN', page: 2 },
    children: 'Grant admin',
  };
  const markup = renderToStaticMarkup(createElement(ActionForm, props));

  expect(markup.startsWith('<form action="/api/admin/role" method="post">')).toBe(true);
  expect(markup).toContain(
    '<input type="hidden" name="userId" value="user-1"/>' +
      '<input type="hidden" name="nextRole" value="ADMIN"/>' +
      '<input type="hidden" name="page" value="2"/><button',
  );
  expect(markup).not.toContain('name="q"');
  // A small secondary button unless the caller asks for another.
  const small = renderToStaticMarkup(createElement(Button, { type: 'submit', size: 'sm' }, 'Grant admin'));
  expect(markup).toContain(small);
});

it('links a disabled button to its sr-only reason and says nothing while enabled', () => {
  const props: Props = { action: '/api/account/characters/unlink', disabledReason: 'Only character.', children: 'Unlink' };

  const disabled = renderToStaticMarkup(createElement(ActionForm, { ...props, disabled: true }));
  const button = disabled.match(/<button\b[^>]*>Unlink<\/button>/)?.[0];
  expect(button).toContain('disabled=""');
  expect(button).toContain('title="Only character."');
  const describedBy = button?.match(/aria-describedby="([^"]+)"/)?.[1];
  expect(describedBy).toBeDefined();
  expect(disabled).toContain(`<span id="${describedBy}" class="sr-only">Only character.</span>`);

  const enabled = renderToStaticMarkup(createElement(ActionForm, props));
  expect(enabled).not.toMatch(/disabled=|title=|aria-describedby=|sr-only/);

  const unexplained = renderToStaticMarkup(createElement(ActionForm, { ...props, disabledReason: undefined, disabled: true }));
  expect(unexplained).toContain('disabled=""');
  expect(unexplained).not.toMatch(/title=|aria-describedby=|sr-only/);
});
