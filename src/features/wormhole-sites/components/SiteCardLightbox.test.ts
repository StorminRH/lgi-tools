import { describe, expect, it } from 'vitest';
import { nextLightboxOpen } from './SiteCardLightbox';

describe('nextLightboxOpen', () => {
  it('clears stored open when mode leaves lightbox so return stays shut', () => {
    let open = true;
    expect(nextLightboxOpen('lightbox', open)).toBe(true);

    open = nextLightboxOpen('expand', open);
    expect(open).toBe(false);
    expect(nextLightboxOpen('lightbox', open)).toBe(false);
  });
});
