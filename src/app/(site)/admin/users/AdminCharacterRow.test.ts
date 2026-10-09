import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('img', { alt: name }),
}));

import { AdminCharacterRow } from './AdminCharacterRow';

function render(props: Parameters<typeof AdminCharacterRow>[0]): string {
  return renderToStaticMarkup(createElement(AdminCharacterRow, props));
}

describe('AdminCharacterRow', () => {
  it('reads portrait, name, character ID and chips before the actions', () => {
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
  });

  it('stacks the actions under the identity on a phone and wraps the chips', () => {
    const html = render({ name: 'E2E Pilot', characterId: 1, portraitUrl: '', actions: 'Unlink' });

    expect(html).toContain('class="flex flex-col gap-2');
    expect(html).toContain('sm:flex-row');
    expect(html).toContain('flex min-w-0 flex-1 flex-wrap');
    expect(html).toContain('min-w-0 truncate');
    expect(html).toContain('pl-10 sm:shrink-0');
  });

  it('links the name when given a page and leaves out an empty actions slot', () => {
    const html = render({ name: 'Cadet', characterId: null, portraitUrl: '', href: '/admin/users/c' });

    expect(html).toContain('href="/admin/users/c"');
    expect(html).toContain('Character ID —');
    expect(html).not.toContain('pl-10');
  });
});
