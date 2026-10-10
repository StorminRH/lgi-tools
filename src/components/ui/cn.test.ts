import { expect, test } from 'vitest';
import { cn } from './cn';

test('cn drops falsy inputs and resolves the registered design tokens against Tailwind classes', () => {
  expect(cn('a', false, null, undefined, 'b')).toBe('a b');

  // A consumer's text color beats the primitive's, and the named type-scale
  // sizes are sizes, not colors, so a size and a tone stay together.
  const override = cn('text-[10px] text-muted whitespace-nowrap', 'text-[var(--color-dps-high)]');
  expect(override).toContain('text-[var(--color-dps-high)]');
  expect(override).not.toContain('text-muted');
  expect(override).toContain('text-[10px]');
  expect(override).toContain('whitespace-nowrap');
  expect(cn('text-[var(--color-isk)]', 'text-label')).toBe('text-[var(--color-isk)] text-label');
  expect(cn('text-muted', 'text-ui')).toBe('text-muted text-ui');
  expect(cn('text-ui', 'text-label')).toBe('text-label');
  expect(cn('text-title', 'text-isk')).toBe('text-title text-isk');
  expect(cn('text-nav', 'text-title')).toBe('text-title');

  // Font roles are families, not weights.
  expect(cn('font-ui', 'font-data')).toBe('font-data');
  expect(cn('font-data', 'font-display')).toBe('font-display');
  expect(cn('font-data', 'font-semibold')).toBe('font-data font-semibold');

  // Tracking, spacing, container and radius scales: last wins.
  expect(cn('tracking-copy', 'tracking-eyebrow')).toBe('tracking-eyebrow');
  expect(cn('tracking-wide', 'tracking-optical')).toBe('tracking-optical');
  expect(cn('mb-cluster', 'mb-section')).toBe('mb-section');
  expect(cn('size-icon-sm', 'size-icon-lg')).toBe('size-icon-lg');
  expect(cn('max-w-reading', 'max-w-frame')).toBe('max-w-frame');
  expect(cn('rounded-ctl', 'rounded-card')).toBe('rounded-card');
  expect(cn('rounded-ctl', 'rounded-full')).toBe('rounded-full');

  // A named elevation token is a shadow, not a shadow color.
  expect(cn('shadow-btn-bezel', 'shadow-red-500')).toBe('shadow-btn-bezel shadow-red-500');
  expect(cn('shadow-card-edge', 'shadow-dd')).toBe('shadow-dd');
  expect(cn('shadow-field-inset', 'shadow-none')).toBe('shadow-none');
  expect(cn('after:shadow-node-lift', 'after:shadow-red-500')).toBe('after:shadow-node-lift after:shadow-red-500');
  expect(cn('after:shadow-node-lift', 'after:shadow-none')).toBe('after:shadow-none');
});
