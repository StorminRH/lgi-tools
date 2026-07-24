import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JsonLd } from './JsonLd';

describe('JsonLd', () => {
  it('renders parseable JSON while neutralizing closing-script text', () => {
    const markup = renderToStaticMarkup(
      createElement(JsonLd, {
        data: { name: '</script><script>alert("x")</script>' },
      }),
    );
    const payload = markup
      .replace('<script type="application/ld+json">', '')
      .replace('</script>', '');

    expect(payload).toContain('\\u003c/script>');
    expect(payload).not.toContain('</script><script>');
    expect(JSON.parse(payload)).toEqual({
      name: '</script><script>alert("x")</script>',
    });
  });
});
