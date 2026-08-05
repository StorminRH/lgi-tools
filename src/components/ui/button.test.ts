import { describe, it, expect } from 'vitest';
import { Button } from './button';

// The primitive is a thin styled shell — the testable logic is the cva variant
// map and the prop-forwarding contract. No DOM: calling the component returns a
// React element whose props we inspect directly (the suite is node-env, no RTL).

describe('Button', () => {
  it('renders a <button> that defaults to type="button"', () => {
    const el = Button({ children: 'x' });
    expect(el.type).toBe('button');
    expect(el.props.type).toBe('button');
  });

  it('lets a caller override type — server-action submit buttons need it', () => {
    expect(Button({ type: 'submit', children: 'x' }).props.type).toBe('submit');
  });

  it('merges a caller className after the variant classes', () => {
    const el = Button({ variant: 'primary', className: 'fixed bottom-4' });
    expect(el.props.className).toContain('bg-feedback-bg');
    expect(el.props.className).toContain('fixed');
  });

  it('renders bare semantic buttons with shared states but without chrome', () => {
    const el = Button({ variant: 'bare', className: 'absolute inset-0' });
    expect(el.props.className).toContain('inline-flex');
    expect(el.props.className).toContain('absolute');
    expect(el.props.className).toContain('focus-visible:ring-1');
    expect(el.props.className).toContain('disabled:opacity-50');
    expect(el.props.className).not.toContain('border-border-idle');
    expect(el.props.className).not.toContain('px-4');
  });
});
