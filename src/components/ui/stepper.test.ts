import { describe, expect, it, vi } from 'vitest';
import { Stepper } from './stepper';

describe('Stepper', () => {
  it('preserves the bordered default control', () => {
    const root = Stepper({ value: 1, onChange: vi.fn(), ariaLabel: 'Runs' });
    const [group] = root.props.children;
    expect(group.props.className).toContain('border-border');
    expect(group.props.children[0].props.children).toBe('–');
  });

  it('renders the compact inline controls and trailing slot', () => {
    const trailing = 'reset';
    const root = Stepper({
      value: 1,
      onChange: vi.fn(),
      ariaLabel: 'Material efficiency',
      variant: 'inline',
      trailing,
    });
    const [group, slot] = root.props.children;
    expect(group.props.className).not.toContain('border-border');
    expect(group.props.children[0].props.children).toBe('▼');
    expect(group.props.children[0].props.className).toContain('after:-inset-1');
    expect(group.props.children[2].props.children).toBe('▲');
    expect(slot.props.children).toBe(trailing);
  });

  it('reserves an external trailing slot without widening the bordered group', () => {
    const root = Stepper({
      value: 1,
      onChange: vi.fn(),
      ariaLabel: 'Runs',
      reserveTrailing: true,
    });
    const [group, slot] = root.props.children;
    expect(group.props.className).toContain('border-border');
    expect(group.props.children).toHaveLength(3);
    expect(slot.props.className).toContain('w-3.5');
  });
});
