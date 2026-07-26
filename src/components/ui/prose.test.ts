import { describe, expect, it } from 'vitest';
import { Prose } from './prose';

describe('Prose', () => {
  it('uses one shared family with the legal modifier by default', () => {
    const element = Prose({ children: 'Legal copy' });
    expect(element.props.className).toBe('prose-copy prose-copy-legal');
  });

  it('uses the devlog modifier and preserves caller classes', () => {
    const element = Prose({
      variant: 'devlog',
      className: 'max-w-prose',
      children: 'Devlog copy',
    });
    expect(element.props.className).toBe('prose-copy prose-copy-devlog max-w-prose');
  });
});
