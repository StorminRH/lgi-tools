import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { AccessListEditor } from './AccessListEditor';

it('renders durable grants, private create state, and an unchosen controlled role', () => {
  const manage = renderToStaticMarkup(
    createElement(AccessListEditor, {
      mode: 'manage',
      corporations: [{ corporationId: 99, name: 'Signal Cartel' }],
      currentGrants: [
        {
          ownerType: 'character',
          ownerId: 42,
          name: 'Scout',
          role: 'viewer',
        },
      ],
      onPrincipalAdd: vi.fn(),
      onRoleChange: vi.fn(),
      onPrincipalRemove: vi.fn(),
      characterSearch: createElement('div', { 'data-character-search-controller': '' }),
    }),
  );
  expect(manage).toContain('data-map-access-editor="manage"');
  expect(manage).toContain('data-map-access-principal="character:42"');
  expect(manage).toContain('Scout');
  expect(manage).toContain('Read-only');
  expect(manage).toContain('Write');
  expect(manage).toContain('Admin');
  expect(manage).toContain('data-character-search-controller');
  expect(manage).not.toContain('Map creator');

  const create = renderToStaticMarkup(
    createElement(AccessListEditor, {
      mode: 'create',
      corporations: [],
      currentGrants: [],
      onPrincipalAdd: vi.fn(),
      onRoleChange: vi.fn(),
      onPrincipalRemove: vi.fn(),
    }),
  );
  expect(create).toContain('Private — no delegated access.');
  expect(create).toContain('No linked corporations available.');
  expect(create).not.toContain('>Admin<');

  const unchosen = renderToStaticMarkup(
    createElement(AccessListEditor, {
      mode: 'create',
      corporations: [],
      currentGrants: [
        {
          ownerType: 'character',
          ownerId: 42,
          name: 'Scout',
          role: null,
        },
      ],
      onPrincipalAdd: vi.fn(),
      onRoleChange: vi.fn(),
      onPrincipalRemove: vi.fn(),
    }),
  );
  expect(unchosen).toContain('data-map-access-principal="character:42"');
  expect(unchosen).toContain('Scout');
  expect(unchosen).toContain('Read-only');
  expect(unchosen).toContain('Write');
  expect(unchosen).not.toContain('data-checked');
});
