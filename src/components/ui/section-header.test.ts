import { describe, expect, it } from 'vitest';
import { SectionHeader } from './section-header';

describe('SectionHeader', () => {
  it('preserves the bordered bar by default', () => {
    expect(SectionHeader({ label: 'Status' }).props.className).toContain('border-b');
  });

  it('provides an unboxed sub-header', () => {
    const className = SectionHeader({ label: 'Status', variant: 'sub' }).props.className;
    expect(className).toContain('text-label');
    expect(className).not.toContain('bg-section');
  });
});
