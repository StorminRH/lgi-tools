import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ENTRY = 'src/app/globals.css';

function inlineImports(file: string, seen = new Set<string>()): string {
  const absolute = path.resolve(file);
  if (seen.has(absolute)) throw new Error(`CSS import cycle at ${file}`);
  seen.add(absolute);
  const source = readFileSync(file, 'utf8');
  return source.replace(/@import\s+"(\.[^"]+\.css)";/g, (_match, relative: string) => {
    const next = path.join(path.dirname(file), relative);
    return inlineImports(next, seen);
  });
}

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

function cascadeText(): string {
  return stripCssComments(inlineImports(ENTRY))
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
