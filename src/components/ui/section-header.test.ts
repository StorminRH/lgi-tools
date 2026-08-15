import { describe, it, expect } from 'vitest';
import { SectionHeader } from './section-header';

// The primitive is a thin styled shell — the testable logic is the size,
// variant, and hint branches. No DOM: calling the component returns a React
// element whose props we inspect directly (the suite is node-env, no RTL).

describe('SectionHeader', () => {
  it('defaults to a small bar and distinguishes size, variant, and hint chrome', () => {
    const el = SectionHeader({ label: 'Label' });
    expect(el.type).toBe('div');
    expect(el.props.className).toContain('text-micro');
    expect(el.props.className).toContain('bg-section');
    expect(el.props.className).toContain('py-[5px]');
    expect(el.props.className).not.toContain('py-2');

    const md = SectionHeader({ label: 'Label', size: 'md', className: 'mb-2' });
    expect(md.props.className).toContain('text-label');
    expect(md.props.className).toContain('py-2');
    expect(md.props.className).toContain('mb-2');

    const sub = SectionHeader({ label: 'Label', variant: 'sub' });
    expect(sub.props.className).toContain('text-label');
    expect(sub.props.className).not.toContain('bg-section');
    expect(sub.props.className).not.toContain('py-[5px]');

    const withHint = SectionHeader({ label: 'Label', hint: '3 saved' });
    const children = withHint.props.children as unknown[];
    const hint = children.find(
      (child) =>
        child !== null &&
        typeof child === 'object' &&
        'props' in child &&
        (child as { props: { className?: string } }).props.className?.includes(
          'text-muted',
        ),
    ) as { type: string; props: { className: string; children: string } };
    expect(hint.type).toBe('span');
    expect(hint.props.className).toContain('text-micro');
    expect(hint.props.className).toContain('font-normal');
    expect(hint.props.children).toBe('3 saved');
  });
});
