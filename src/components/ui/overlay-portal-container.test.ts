import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  OverlayPortalContainerProvider,
  useOverlayPortalContainer,
} from './overlay-portal-container';

function Probe() {
  const container = useOverlayPortalContainer();
  return createElement('span', {
    'data-has-container': container === null ? 'false' : 'true',
    'data-tag': container?.tagName ?? 'none',
  });
}

describe('overlay portal container', () => {
  it('is null outside an overlay provider', () => {
    const markup = renderToStaticMarkup(createElement(Probe));
    expect(markup).toContain('data-has-container="false"');
    expect(markup).toContain('data-tag="none"');
  });

  it('exposes a provided container element to nested consumers', () => {
    const host = { tagName: 'SECTION' } as HTMLElement;
    const markup = renderToStaticMarkup(
      createElement(
        OverlayPortalContainerProvider,
        { container: host },
        createElement(Probe),
      ),
    );
    expect(markup).toContain('data-has-container="true"');
    expect(markup).toContain('data-tag="SECTION"');
  });
});
