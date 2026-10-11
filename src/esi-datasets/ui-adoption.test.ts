import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  deadAllowlistEntries,
  unexpectedFamilies,
} from '@/composition/__tests__/ui-adoption-census';
import { uiAdoptionRegistry } from '@/composition/__tests__/ui-adoption-registry';
import { filesMatching, listSourceFiles, stripComments } from '@/lib/__tests__/source-scan';

const PRODUCTION_SOURCES = listSourceFiles({
  roots: ['src'],
  extensions: ['.ts', '.tsx'],
  skipDirectories: ['node_modules', '__fixtures__', '_generated', 'ui'],
  skipSuffixes: ['.test.ts', '.test.tsx', '.d.ts'],
});

function codeMatching(pattern: RegExp): string[] {
  return filesMatching(PRODUCTION_SOURCES, pattern, (file) =>
    stripComments(readFileSync(file, 'utf8')),
  );
}

function exceptionFiles(entries: readonly { file: string }[]): string[] {
  return entries.map((entry) => entry.file).sort();
}

describe('UI adoption exception census', () => {
  it('pins every raw button outside the primitive layer', () => {
    expect(codeMatching(/<button\b/)).toEqual(exceptionFiles(uiAdoptionRegistry.rawButtons));
  });

  it('pins every native details surface outside the primitive layer', () => {
    expect(codeMatching(/<details\b/)).toEqual(exceptionFiles(uiAdoptionRegistry.rawDetails));
  });

  it('keeps visible raw fields and raw tables at zero', () => {
    expect(codeMatching(/<(?:textarea|table)\b/)).toEqual([]);
    expect(codeMatching(/<input\b(?![^>]*\btype=["']hidden["'])/)).toEqual([]);
  });

  it('keeps POST forms and their hidden fields inside the ActionForm primitive', () => {
    expect(codeMatching(/<form\b[^>]*\bmethod=["']post["']/i)).toEqual([]);
    expect(codeMatching(/<input\b[^>]*\btype=["']hidden["']/)).toEqual([]);
  });

  it('pins native titles and leaves disabled-control reasons to ActionForm', () => {
    expect(codeMatching(/<[a-z][^>]*\btitle=/)).toEqual(
      exceptionFiles(uiAdoptionRegistry.nativeTitles),
    );
    expect(codeMatching(/\btitle=\{(?:disabled|view\.isSelf)\s*\?/)).toEqual([]);
  });

  it('keeps hand-built action semantics and primitive-owned tokens at zero', () => {
    expect(codeMatching(/\brole=["']button["']|role:\s*["']button["']/)).toEqual([]);
    expect(codeMatching(/<[a-z][^>]*\baria-pressed=/)).toEqual([]);
    expect(
      codeMatching(
        /text-empty|(?:bg|text|border)-(?:pill|chip)-|skeleton-shimmer|--pct|toast\.loading|\bdata-chevron\b/,
      ),
    ).toEqual([]);
  });

  it('leaves skeleton bars decorative by default instead of hidden one by one', () => {
    expect(codeMatching(/<Skeleton\b[^>]*aria-hidden/)).toEqual([]);
  });
});

function allStylesheets(): string {
  return listSourceFiles({ roots: ['src'], extensions: ['.css'] })
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

describe('UI adoption CSS-family census', () => {
  it('allows only the recorded surviving page-family prefixes', () => {
    const css = allStylesheets();
    const allowed = [
      ...uiAdoptionRegistry.temporaryCssFamilies,
      ...uiAdoptionRegistry.retainedCssFamilies,
    ];

    expect(unexpectedFamilies(css, allowed)).toEqual([]);
    expect(deadAllowlistEntries(css, allowed)).toEqual([]);
  });

  it('detects unrecorded families and stale allowlist entries', () => {
    const css = [
      '.nav-host, .nav-unrecorded {}',
      '.shell > .sites-combinator {}',
      '.sites-detail-zoom {}',
    ].join('\n');

    expect(unexpectedFamilies(css, ['nav-host', 'sites-detail-zoom'])).toEqual(
      ['nav-unrecorded', 'sites-combinator'],
    );
    expect(deadAllowlistEntries(css, ['nav-host', 'sites-detail-zoom', 'prose-copy']))
      .toEqual(['prose-copy']);
  });
});
