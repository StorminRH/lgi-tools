import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccessListEditor } from './AccessListEditor';

describe('AccessListEditor', () => {
  it('renders only durable grants, with no synthetic creator row', () => {
    const markup = renderToStaticMarkup(
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

    expect(markup).toContain('data-map-access-editor="manage"');
    expect(markup).toContain('data-map-access-principal="character:42"');
    expect(markup).toContain('Scout');
    expect(markup).toContain('Read-only');
    expect(markup).toContain('Write');
    expect(markup).toContain('Admin');
    expect(markup).toContain('data-character-search-controller');
    expect(markup).not.toContain('Map creator');
  });

  it('renders an honest private state and creation-only role vocabulary', () => {
    const markup = renderToStaticMarkup(
      createElement(AccessListEditor, {
        mode: 'create',
        corporations: [],
        currentGrants: [],
        onPrincipalAdd: vi.fn(),
        onRoleChange: vi.fn(),
        onPrincipalRemove: vi.fn(),
      }),
    );

    expect(markup).toContain('Private — no delegated access.');
    expect(markup).toContain('No linked corporations available.');
    expect(markup).not.toContain('>Admin<');
  });

  it('keeps an unchosen principal controlled with no selected role', () => {
    const markup = renderToStaticMarkup(
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

    expect(markup).toContain('data-map-access-principal="character:42"');
    expect(markup).toContain('Scout');
    expect(markup).toContain('Read-only');
    expect(markup).toContain('Write');
    expect(markup).not.toContain('data-checked');
  });
});
