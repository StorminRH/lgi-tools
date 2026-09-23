import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ENTRY = 'src/app/globals.css';
const DOCUMENT_CLASSES = ['no-print', 'page-backdrop', 'page-grain', 'print-only'] as const;
const FOREIGN_CLASS = /^(?:react-flow__|sonner-)/;

function walk(directory: string, accept: (file: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(file, accept));
    else if (accept(file)) found.push(file);
  }
  return found;
}

function stripComments(source: string): string {
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

function stripBalanced(source: string, atRule: string): string {
  let out = '';
  let cursor = 0;
  const marker = `@${atRule}`;
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start === -1) {
      out += source.slice(cursor);
      break;
    }
    out += source.slice(cursor, start);
    const open = source.indexOf('{', start);
    if (open === -1) break;
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }
    cursor = end;
  }
  return out;
}

function classTokens(css: string): string[] {
  const plain = stripBalanced(stripBalanced(stripComments(css), 'theme'), 'utility');
  return [...new Set([...plain.matchAll(/\.([_a-zA-Z][\w-]*)/g)].map((match) => match[1] ?? ''))]
    .filter((name) => name.includes('-') && !FOREIGN_CLASS.test(name))
    .sort();
}

function stylesheets(): string[] {
  return walk('src', (file) => file.endsWith('.css') && !file.endsWith('.module.css')).sort();
}

function productionSources(): string[] {
  return walk('src', (file) => {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return false;
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx') || file.endsWith('.d.ts')) return false;
    if (file.split(path.sep).includes('__tests__')) return false;
    return true;
  });
}

function mentions(source: string, className: string): boolean {
  return new RegExp(`(?<![\\w-])${className}(?![\\w-])`).test(source);
}

function importSpecifier(file: string): string {
  let relative = path.relative(path.dirname(ENTRY), file).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

function wears(source: string, className: string): boolean {
  const body = source
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"]\s*;?/g, '')
    .replace(/import\s+['"][^'"]+['"]\s*;?/g, '')
    .replace(/querySelector(?:All)?\(\s*['"][^'"]+['"]\s*\)/g, '')
    .replace(/\.(?:closest|matches)\(\s*['"][^'"]+['"]\s*\)/g, '');
  const stem = className.endsWith('-rev') ? className.slice(0, -'-rev'.length) : className;
  return mentions(body, className) || (stem !== className && mentions(body, stem) && body.includes('-rev'));
}

describe('stylesheet contract', () => {
  const entry = readFileSync(ENTRY, 'utf8');
  const partials = stylesheets().filter((file) => file !== ENTRY);

  it('keeps component classes out of globals.css', () => {
    const unexpected = classTokens(entry).filter(
      (name) => !DOCUMENT_CLASSES.includes(name as (typeof DOCUMENT_CLASSES)[number]),
    );
    expect(
      unexpected,
      [
        'globals.css is the Tailwind root, not a component stylesheet.',
        'Change a reusable skin on the primitive in src/components/ui.',
        'Style a one-off with utilities on that element.',
        'When utilities cannot express the rule, add <owner>.css beside the owner and @import it here.',
        'A second consumer means a primitive. Do not add the class to globals.css.',
        `Unexpected classes: ${unexpected.join(', ')}`,
      ].join('\n'),
    ).toEqual([]);
  });

  it('imports every owner stylesheet once, ui first', () => {
    const imported = [...entry.matchAll(/@import\s+"(\.[^"]+\.css)";/g)].map((match) => match[1] ?? '');
    const ui = partials
      .filter((file) => file.includes(`${path.sep}components${path.sep}ui${path.sep}`))
      .sort((left, right) => importSpecifier(left).localeCompare(importSpecifier(right)));
    const rest = partials
      .filter((file) => !ui.includes(file))
      .sort((left, right) => importSpecifier(left).localeCompare(importSpecifier(right)));
    const expected = [...ui, ...rest].map(importSpecifier);
    expect(imported, `expected import block:\n${expected.map((file) => `@import "${file}";`).join('\n')}`).toEqual(
      expected,
    );
    expect(new Set(imported).size).toBe(imported.length);
  });

  it('gives every stylesheet a same-named owner', () => {
    const missing = partials.filter((file) => {
      const base = path.basename(file, '.css');
      const dir = path.dirname(file);
      return !existsSync(path.join(dir, `${base}.ts`)) && !existsSync(path.join(dir, `${base}.tsx`));
    });
    expect(missing, 'name the css file after the ts or tsx file beside it').toEqual([]);
  });

  it('keeps Tailwind at-rules in the compilation root', () => {
    const offenders = partials.filter((file) => /@theme\b|@utility\b/.test(stripComments(readFileSync(file, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('lets a custom class have one owner directory', () => {
    const loaded = productionSources()
      .filter((file) => file !== 'src/lib/eve-image.ts')
      .map((file) => ({ file, source: readFileSync(file, 'utf8') }));
    const tokens = new Set(partials.flatMap((sheet) => classTokens(readFileSync(sheet, 'utf8'))));
    const problems: string[] = [];
    for (const token of tokens) {
      const dirs = [
        ...new Set(
          loaded.filter((source) => wears(source.source, token)).map((source) => path.dirname(source.file)),
        ),
      ].sort();
      const outsideMapper = dirs.filter((dir) => !dir.startsWith(`src${path.sep}mapper${path.sep}`));
      const scattered = dirs.some((dir) => dir.startsWith(`src${path.sep}mapper${path.sep}`))
        ? outsideMapper
        : dirs;
      if (scattered.length < 2) continue;
      problems.push(
        `.${token} is worn in ${scattered.join(', ')}. A second consumer is a primitive under src/components/ui. Move the rule to that primitive's sibling .css. Do not add the class to globals.css.`,
      );
    }
    expect(problems).toEqual([]);
  });

  it('keeps the status-led reduced-motion bug pinned to the weak selector', () => {
    const css = stripComments(readFileSync('src/components/ui/status-dot.css', 'utf8'));
    const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}/.exec(css)?.[1] ?? '';
    expect(reduced).toContain('.status-led { animation: none; }');
    expect(reduced).not.toContain('.status-led.online');
  });
});
