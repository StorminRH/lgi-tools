import { describe, expect, it } from 'vitest';
import { buildDevlogArticleJsonLd } from './article-json-ld';
import type { DevlogDocument } from './types';

describe('buildDevlogArticleJsonLd', () => {
  it('uses the committed document date for publication and modification', () => {
    const document: DevlogDocument = {
      slug: 'building-with-ai',
      title: 'Building with AI',
      updated: '2026-07-12',
      blocks: [
        {
          type: 'paragraph',
          tokens: [{ type: 'text', value: 'How LGI.tools is built.' }],
        },
      ],
    };

    expect(buildDevlogArticleJsonLd(document, '/devlog/building-with-ai')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Building with AI',
      description: 'How LGI.tools is built.',
      datePublished: '2026-07-12',
      dateModified: '2026-07-12',
      url: 'https://lgi.tools/devlog/building-with-ai',
      mainEntityOfPage: 'https://lgi.tools/devlog/building-with-ai',
      author: { '@id': 'https://lgi.tools/#organization' },
      publisher: { '@id': 'https://lgi.tools/#organization' },
    });
  });
});
