import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('filters falsy values (parity with the old concat behavior)', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('resolves a conflicting Tailwind pair — last wins', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  // The real before/after this change exists to fix: NpcRow passes a DPS-tier
  // text color into <Stat>, whose base sets `text-muted`. The old concatenating
  // cn shipped BOTH `text-muted` and the override and let the cascade decide;
  // twMerge now drops the loser so the consumer's color deterministically wins.
  it("lets a consumer's text-color override beat the primitive's", () => {
    const result = cn(
      'text-[10px] text-muted whitespace-nowrap',
      'text-[var(--color-dps-high)]',
    );
    expect(result).toContain('text-[var(--color-dps-high)]'); // override kept…
    expect(result).not.toContain('text-muted'); // …the base color dropped
    expect(result).toContain('text-[10px]'); // font-size survives (different group)
    expect(result).toContain('whitespace-nowrap');
  });

  // Regression (3.8.2.1): the named type-scale tokens (text-ui/label/micro/…) must
  // register as font-size, not text-color — otherwise twMerge conflates them with
  // a tone color in one cn() call and drops one, so a pill silently loses its
  // color (or its size). extendTailwindMerge in cn.ts registers them.
  it('keeps a named type-scale size and a tone color together', () => {
    const a = cn('text-[var(--color-isk)]', 'text-label');
    expect(a).toContain('text-[var(--color-isk)]');
    expect(a).toContain('text-label');

    const b = cn('text-muted', 'text-ui');
    expect(b).toContain('text-muted');
    expect(b).toContain('text-ui');

    // two named sizes still conflict → last wins
    expect(cn('text-ui', 'text-label')).toBe('text-label');
  });

  // Regression (3.8.2.2): the named shadow tokens (shadow-field-inset/btn-bezel/…)
  // must register as box-shadow, not shadow-COLOR. Unregistered, twMerge files them
  // as shadow colors, so a `shadow-<color>` in the same cn() call drops the token
  // (and shadow-none can't override it). cn.ts registers them in the shadow group.
  it('keeps a named elevation token and a shadow color together', () => {
    const a = cn('shadow-btn-bezel', 'shadow-red-500');
    expect(a).toContain('shadow-btn-bezel'); // box-shadow token survives…
    expect(a).toContain('shadow-red-500'); // …alongside the shadow color (different group)

    // two named box-shadows conflict → last wins
    expect(cn('shadow-card-edge', 'shadow-dd')).toBe('shadow-dd');
    // and shadow-none overrides a named token
    expect(cn('shadow-field-inset', 'shadow-none')).toBe('shadow-none');
  });

  // Regression (3.8.2.2): the named radius tokens (rounded-ctl/rounded-card) must
  // register as border-radius so they dedupe/override correctly against other
  // rounded-* classes rather than both surviving.
  it('resolves named radius tokens against other radii — last wins', () => {
    expect(cn('rounded-ctl', 'rounded-card')).toBe('rounded-card');
    expect(cn('rounded-ctl', 'rounded-full')).toBe('rounded-full');
  });
});
