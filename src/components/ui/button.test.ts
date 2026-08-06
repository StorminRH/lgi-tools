import { describe, it, expect } from 'vitest';
import { Button } from './button';

// The primitive is a thin styled shell — the testable logic is the cva variant
// map and the prop-forwarding contract. No DOM: calling the component returns a
// React element whose props we inspect directly (the suite is node-env, no RTL).

describe('Button', () => {
  it('defaults type to button, allows submit override, and distinguishes primary vs bare chrome', () => {
    expect(Button({ children: 'x' }).props.type).toBe('button');
    expect(Button({ type: 'submit', children: 'x' }).props.type).toBe('submit');

    const primary = Button({ variant: 'primary', className: 'fixed bottom-4' });
    expect(primary.props.className).toContain('bg-feedback-bg');
    expect(primary.props.className).toContain('fixed');

    const bare = Button({ variant: 'bare', className: 'absolute inset-0' });
    expect(bare.props.className).toContain('absolute');
    expect(bare.props.className).toContain('focus-visible:ring-1');
    expect(bare.props.className).toContain('disabled:opacity-50');
    expect(bare.props.className).not.toContain('border-border-idle');
    expect(bare.props.className).not.toContain('px-4');
  });
});
