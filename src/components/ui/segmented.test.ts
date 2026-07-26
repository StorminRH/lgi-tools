import { describe, expect, it } from 'vitest';
import { SegmentedControl } from './segmented';

const options = [
  { value: 'gross', label: 'Gross' },
  { value: 'net', label: 'Net' },
];

describe('SegmentedControl', () => {
  it('keeps the existing default density', () => {
    const root = SegmentedControl({ options, value: 'gross', label: 'Margin' });
    expect(root.props.className).toContain('p-[3px]');
    expect(root.props.children[0].props.className).toContain('px-3');
  });

  it('provides the approved compact density', () => {
    const root = SegmentedControl({
      options,
      value: 'gross',
      label: 'Margin',
      density: 'compact',
    });
    expect(root.props.className).toContain('p-0');
    expect(root.props.children[0].props.className).toContain('px-2');
    expect(root.props.children[0].props.className).toContain('text-label');
    expect(root.props.children[0].props.className).toContain('font-ui');
    expect(root.props.children[0].props.className).not.toContain('uppercase');
    expect(root.props.children[0].props.className).not.toContain('px-3');
    expect(root.props.children[0].props.className).not.toContain('text-micro');
  });
});
