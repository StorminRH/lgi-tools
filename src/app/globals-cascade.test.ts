import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CASCADE_FILES = ['src/app/globals.css'] as const;

function stripCssComments(source: string): string {
  let out = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        const next = source[i + 1];
        if (next !== undefined) {
          out += next;
          i += 1;
        }
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function cascadeText(files: readonly string[] = CASCADE_FILES): string {
  const joined = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  return stripCssComments(joined)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function earlier(css: string, first: string, second: string): void {
  const firstAt = css.indexOf(first);
  const secondAt = css.indexOf(second);
  expect(firstAt, first).toBeGreaterThanOrEqual(0);
  expect(secondAt, second).toBeGreaterThan(firstAt);
}

describe('globals.css cascade contract', () => {
  it('keeps the delivered declarations', () => {
    expect(cascadeText()).toMatchSnapshot();
  });

  it('lets the legal note beat prose paragraphs', () => {
    earlier(cascadeText(), '.prose-copy p {', '.legal-note p {');
  });

  it('lets print show .print-only after the screen hide', () => {
    earlier(
      cascadeText(),
      '.print-only {\ndisplay: none;',
      '.print-only {\ndisplay: block;',
    );
  });

  it('places the status-led reduced-motion rule after the online pulse', () => {
    earlier(cascadeText(), '.status-led.online {', '.status-led { animation: none; }');
  });

  it('lets the start-edge scrollbar track override the default track', () => {
    earlier(
      cascadeText(),
      '.scroll-area::-webkit-scrollbar-track {',
      '.scroll-area-start::-webkit-scrollbar-track {',
    );
  });
});
