import { describe, expect, it } from 'vitest';
import { navigationMenuLink } from './navigation-menu';

describe('navigationMenuLink', () => {
  it('uses sentence-case interface typography without cell dividers', () => {
    const classes = navigationMenuLink();
    expect(classes).toContain('font-ui');
    expect(classes).toContain('text-nav');
    expect(classes).not.toContain('uppercase');
    expect(classes).not.toContain('border-r');
  });

  it('shares state across desktop and menu placements', () => {
    expect(navigationMenuLink({ active: true })).toContain('after:opacity-100');
    expect(navigationMenuLink({ placement: 'menu' })).toContain('w-full');
    expect(navigationMenuLink({ placement: 'menu', disabled: true })).toContain('opacity-40');
  });
});
