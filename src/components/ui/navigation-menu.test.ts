import { describe, expect, it } from 'vitest';
import { navigationMenuLink } from './navigation-menu';

describe('navigationMenuLink', () => {
  it('uses sentence-case interface typography while the parent list owns dividers', () => {
    const classes = navigationMenuLink();
    expect(classes).toContain('font-ui');
    expect(classes).toContain('text-nav');
    expect(classes).not.toContain('uppercase');
    expect(classes).not.toContain('border-r');
  });

  it('shares state across desktop and menu placements', () => {
    const activeDesktop = navigationMenuLink({ active: true });
    const enabledMenu = navigationMenuLink({ placement: 'menu' });
    const disabledMenu = navigationMenuLink({ placement: 'menu', disabled: true });

    expect(activeDesktop).toContain('after:opacity-100');
    expect(activeDesktop).toContain('focus-visible:ring-isk-sub');
    expect(enabledMenu).toContain('w-full');
    expect(enabledMenu).toContain('hover:bg-row-active');
    expect(disabledMenu).toContain('opacity-40');
    expect(disabledMenu).not.toContain('hover:');
  });
});
