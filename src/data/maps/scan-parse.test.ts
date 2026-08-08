import { describe, expect, it } from 'vitest';
import { parseScannerPaste } from './scan-parse';
import { SCANNER_PASTE_FIXTURES } from './scan-parse.fixtures';

describe('parseScannerPaste', () => {
  it.each(SCANNER_PASTE_FIXTURES)('parses operator fixture: $name', ({ paste, expected }) => {
    expect(parseScannerPaste(paste)).toEqual(expected);
  });

  it('rejects unknown, malformed, and empty input without fabricating rows', () => {
    expect(
      parseScannerPaste(
        'BAD-001\tCosmic Signature\tUnknown Site\tMystery\t50.0%\t1 AU\nmalformed line',
      ),
    ).toEqual({
      rows: [],
      rejects: [
        {
          lineNumber: 1,
          raw: 'BAD-001\tCosmic Signature\tUnknown Site\tMystery\t50.0%\t1 AU',
          reason: 'invalid-group',
        },
        { lineNumber: 2, raw: 'malformed line', reason: 'column-count' },
      ],
    });
    expect(parseScannerPaste('\n\r\n')).toEqual({
      rows: [],
      rejects: [{ lineNumber: 0, raw: '', reason: 'no-scanner-rows' }],
    });
  });
});
