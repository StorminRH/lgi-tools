import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: root });
const rule = 'render-clock/no-read';

/** The 1-based lines render-clock reports when `lines` is linted as `file`. */
async function reportedLines(file, lines) {
  const [result] = await eslint.lintText(lines.join('\n'), { filePath: `${root}${file}` });
  return result.messages.filter((message) => message.ruleId === rule).map((message) => message.line);
}

describe('render clock', () => {
  it('reports clock reads that run while a component renders', async () => {
    expect(
      await reportedLines('src/features/tool/components/Age.tsx', [
        "import { useMemo, useState } from 'react';",
        'const LOADED_AT = Date.now();',
        'function ageOf(at: Date, now = Date.now()) { return now - at.getTime(); }',
        'export async function ServerAge({ at }: { at: Date }) {',
        '  return <span>{ageOf(at, Date.now())}</span>;',
        '}',
        'export function ClientAge({ at, rows }: { at: Date; rows: Date[] }) {',
        '  const [mounted] = useState(() => Date.now());',
        '  const today = useMemo(() => new Date(), []);',
        '  const ages = rows.map((row) => Date.now() - row.getTime());',
        '  return <span>{LOADED_AT}{mounted}{String(today)}{ages}{ageOf(at)}</span>;',
        '}',
      ]),
    ).toEqual([2, 3, 5, 8, 9, 10]);
  });

  it('covers hooks, view models, and formatters, not data reads or tests', async () => {
    const read = ['export function stamp() { return Date.now(); }'];
    expect(await reportedLines('src/features/tool/use-stamp.ts', read)).toEqual([1]);
    expect(await reportedLines('src/features/tool/stamp-view.ts', read)).toEqual([1]);
    expect(await reportedLines('src/lib/format/stamp.ts', read)).toEqual([1]);
    expect(await reportedLines('src/features/tool/queries.ts', read)).toEqual([]);
    expect(await reportedLines('src/data/tool/refresh-on-view.ts', read)).toEqual([]);
    expect(await reportedLines('src/features/tool/components/Age.test.ts', read)).toEqual([]);
  });

  it('leaves reads in handlers, effects, and timers, and dates built from a value', async () => {
    expect(
      await reportedLines('src/features/tool/components/Clock.tsx', [
        "import { useEffect, useMemo, useState } from 'react';",
        'export function Clock({ iso }: { iso: string }) {',
        '  const [now, setNow] = useState(0);',
        '  useEffect(() => {',
        '    const timer = setInterval(() => setNow(Date.now()), 1000);',
        '    return () => clearInterval(timer);',
        '  }, []);',
        '  const stamp = useMemo(() => () => Date.now(), []);',
        '  const at = new Date(iso);',
        '  return <button onClick={() => setNow(stamp())}>{now}{String(at)}{new Date(0).getTime()}</button>;',
        '}',
      ]),
    ).toEqual([]);
  });
});
