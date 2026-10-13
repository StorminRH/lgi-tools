import { expect, test } from 'vitest';
import { parsePercentDraft } from './percent-draft';

test('a percent draft is blank, or a plain decimal from 0 up to the max', () => {
  expect(parsePercentDraft('', 50)).toEqual({ ok: true, value: null });
  expect(parsePercentDraft('   ', 50)).toEqual({ ok: true, value: null });
  expect(parsePercentDraft('0', 50)).toEqual({ ok: true, value: 0 });
  expect(parsePercentDraft('0.25', 50)).toEqual({ ok: true, value: 0.25 });
  expect(parsePercentDraft(' 3.38 ', 50)).toEqual({ ok: true, value: 3.38 });
  expect(parsePercentDraft('50', 50)).toEqual({ ok: true, value: 50 });

  for (const draft of [
    '50.01',
    '1'.padEnd(400, '0'),
    '-1',
    'abc',
    'NaN',
    'Infinity',
    '1e1',
    '0xa',
    '1.',
    '.5',
    '+1',
    ' 1 2 ',
  ]) {
    expect(parsePercentDraft(draft, 50)).toEqual({ ok: false });
  }
});
