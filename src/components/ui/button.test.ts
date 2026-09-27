import { expect, it } from 'vitest';
import { Button } from './button';

it('defaults type to button and allows a submit override', () => {
  const el = Button({ children: 'x' });
  expect(el.type).toBe('button');
  expect(el.props.type).toBe('button');
  expect(Button({ type: 'submit', children: 'x' }).props.type).toBe('submit');
});
