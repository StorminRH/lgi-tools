import { describe, it, expect } from 'vitest';
import { Button, buttonVariants } from './button';

// The primitive is a thin styled shell — the testable logic is the cva variant
// map and the prop-forwarding contract. No DOM: calling the component returns a
// React element whose props we inspect directly (the suite is node-env, no RTL).

describe('buttonVariants', () => {
  it('maps each intent to its signature tokens', () => {
    expect(buttonVariants({ variant: 'primary' })).toContain('bg-feedback-bg');
    expect(buttonVariants({ variant: 'primary' })).toContain('hover:bg-isk');
    expect(buttonVariants({ variant: 'secondary' })).toContain('border-border-idle');
    expect(buttonVariants({ variant: 'danger' })).toContain('text-pill-red-text');
    // ghost is the only intent without the bezel
    expect(buttonVariants({ variant: 'ghost' })).not.toContain('shadow-btn-bezel');
    expect(buttonVariants({ variant: 'secondary' })).toContain('shadow-btn-bezel');
  });

  it('sizes to the two control paddings', () => {
    expect(buttonVariants({ size: 'md' })).toContain('px-4');
    expect(buttonVariants({ size: 'sm' })).toContain('px-2.5');
  });

  it('defaults to secondary/md', () => {
    expect(buttonVariants({})).toContain('border-border-idle');
    expect(buttonVariants({})).toContain('px-4');
  });
});

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
});
