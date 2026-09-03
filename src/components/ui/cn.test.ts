import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('filters falsy values (parity with the old concat behavior)', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('resolves a conflicting Tailwind pair — last wins', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it("lets a consumer's text-color override beat the primitive's", () => {
    const result = cn(
      'text-[10px] text-muted whitespace-nowrap',
      'text-[var(--color-dps-high)]',
    );
    expect(result).toContain('text-[var(--color-dps-high)]');
    expect(result).not.toContain('text-muted');
    expect(result).toContain('text-[10px]');
    expect(result).toContain('whitespace-nowrap');
  });

  it('keeps a named type-scale size and a tone color together', () => {
    const a = cn('text-[var(--color-isk)]', 'text-label');
    expect(a).toContain('text-[var(--color-isk)]');
    expect(a).toContain('text-label');

    const b = cn('text-muted', 'text-ui');
    expect(b).toContain('text-muted');
    expect(b).toContain('text-ui');

    expect(cn('text-ui', 'text-label')).toBe('text-label');
    expect(cn('text-title', 'text-isk')).toBe('text-title text-isk');
    expect(cn('text-nav', 'text-title')).toBe('text-title');
  });

  it('resolves the semantic font roles without conflating family and weight', () => {
    expect(cn('font-ui', 'font-data')).toBe('font-data');
    expect(cn('font-data', 'font-display')).toBe('font-display');
    expect(cn('font-data', 'font-semibold')).toBe('font-data font-semibold');
  });

  it('resolves the registered tracking scale — last wins', () => {
    expect(cn('tracking-copy', 'tracking-eyebrow')).toBe('tracking-eyebrow');
    expect(cn('tracking-wide', 'tracking-optical')).toBe('tracking-optical');
  });

  it('resolves the shared spacing and container scales', () => {
    expect(cn('mb-cluster', 'mb-section')).toBe('mb-section');
    expect(cn('size-icon-sm', 'size-icon-lg')).toBe('size-icon-lg');
    expect(cn('max-w-reading', 'max-w-frame')).toBe('max-w-frame');
  });

  it('keeps a named elevation token and a shadow color together', () => {
    const a = cn('shadow-btn-bezel', 'shadow-red-500');
    expect(a).toContain('shadow-btn-bezel');
    expect(a).toContain('shadow-red-500');

    expect(cn('shadow-card-edge', 'shadow-dd')).toBe('shadow-dd');

    expect(cn('shadow-field-inset', 'shadow-none')).toBe('shadow-none');
  });

  it('resolves named radius tokens against other radii — last wins', () => {
    expect(cn('rounded-ctl', 'rounded-card')).toBe('rounded-card');
    expect(cn('rounded-ctl', 'rounded-full')).toBe('rounded-full');
  });
});
