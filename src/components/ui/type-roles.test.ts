import { describe, expect, it } from 'vitest';
import { eyebrow } from './type-roles';

describe('eyebrow', () => {
  it('owns the default micro-caps treatment', () => {
    const classes = eyebrow();
    expect(classes).toContain('font-ui');
    expect(classes).toContain('uppercase');
    expect(classes).toContain('tracking-wide');
    expect(classes).toContain('text-label');
  });

  it('supports the stronger shared emphasis without a second recipe', () => {
    const classes = eyebrow({ size: 'micro', tone: 'isk', emphasis: 'strong' });
    expect(classes).toContain('text-micro');
    expect(classes).toContain('text-isk');
    expect(classes).toContain('tracking-eyebrow');
  });
});
