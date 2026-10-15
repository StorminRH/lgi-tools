import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('img', { alt: name }),
}));

import { AdminCharacterRow } from './AdminCharacterRow';

function render(props: Parameters<typeof AdminCharacterRow>[0]): string {
  return renderToStaticMarkup(createElement(AdminCharacterRow, props));
}

test('reads portrait, name, character ID and chips before the actions, and leaves out an empty actions slot', () => {
  const html = render({
    name: 'E2E Pilot',
    characterId: 9_000_001,
    portraitUrl: '',
    chips: createElement('span', null, 'Selected'),
    actions: createElement('button', { type: 'button' }, 'Unlink'),
  });

  expect(html.startsWith('<li')).toBe(true);
  expect(html).toContain('alt="E2E Pilot"');
  expect(html).toContain('Character ID 9000001');
  expect(html.indexOf('Selected')).toBeLessThan(html.indexOf('Unlink'));

  const bare = render({ name: 'Cadet', characterId: null, portraitUrl: '', href: '/admin/users/c' });

  expect(bare).toContain('href="/admin/users/c"');
  expect(bare).toContain('Character ID —');
  expect(bare.match(/<div/g)).toHaveLength(html.match(/<div/g)!.length - 1);
});
