import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EveImage, eveImageUrl } from './eve-image';

describe('EveImage loader', () => {
  it('replaces size while preserving other image-server parameters', () => {
    const result = eveImageUrl('type-render', {
      src: 'https://images.evetech.net/types/587/render?tenant=singularity&size=32',
      width: 129,
      quality: undefined,
    });

    expect(result).toBe(
      'https://images.evetech.net/types/587/render?tenant=singularity&size=256',
    );
  });
});

describe('EveImage rendering', () => {
  it('keeps remote EVE image candidates off the Next optimizer', () => {
    const markup = renderToStaticMarkup(
      createElement(EveImage, {
        source: 'eve',
        family: 'corporation-logo',
        src: 'https://images.evetech.net/corporations/1/logo',
        alt: '',
        width: 28,
        height: 28,
      }),
    );

    expect(markup).toContain('images.evetech.net/corporations/1/logo?size=');
    expect(markup).not.toContain('/_next/image');
  });

  it('serves the local static asset as-is', () => {
    const markup = renderToStaticMarkup(
      createElement(EveImage, {
        source: 'static',
        src: '/eve-sso-login-black-large.png',
        alt: 'Log in with EVE Online',
        width: 270,
        height: 45,
      }),
    );

    expect(markup).toContain('src="/eve-sso-login-black-large.png"');
    expect(markup).not.toContain('/_next/image');
  });
});
