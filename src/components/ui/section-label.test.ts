import { describe, expect, it } from 'vitest';
import { SectionLabel } from './section-label';

describe('SectionLabel', () => {
  it('renders the shared prefix by default', () => {
    expect(SectionLabel({ children: 'Build plan' }).props.children[0].props.children[0]).toBeTruthy();
  });

  it('can omit the prefix for existing unprefixed labels', () => {
    expect(
      SectionLabel({ children: 'Build plan', prefix: false }).props.children[0].props.children[0],
    ).toBe(false);
  });
});
