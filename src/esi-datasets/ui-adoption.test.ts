import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  deadAllowlistEntries,
  unexpectedFamilies,
} from '@/composition/__tests__/ui-adoption-census';
import { uiAdoptionRegistry } from '@/composition/__tests__/ui-adoption-registry';

const SKIPPED_DIRECTORIES = new Set(['node_modules', '__fixtures__', '_generated', 'ui']);
const SKIPPED_SUFFIXES = ['.test.ts', '.test.tsx', '.d.ts'];

function collectProductionSources(directory: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !SKIPPED_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
      ) {
        found.push(path);
      }
    }
  };
  walk(directory);
  return found.sort();
}

const productionSources = collectProductionSources('src');

function filesMatching(pattern: RegExp): string[] {
  return productionSources
    .filter((file) => {
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return pattern.test(source);
    })
    .sort();
}

function exceptionFiles(entries: readonly { file: string }[]): string[] {
  return entries.map((entry) => entry.file).sort();
}

describe('UI adoption exception census', () => {
  it('pins every raw button outside the primitive layer', () => {
    expect(filesMatching(/<button\b/)).toEqual(exceptionFiles(uiAdoptionRegistry.rawButtons));
  });

  it('pins every native details surface outside the primitive layer', () => {
    expect(filesMatching(/<details\b/)).toEqual(exceptionFiles(uiAdoptionRegistry.rawDetails));
  });

  it('keeps visible raw fields and raw tables at zero', () => {
    expect(filesMatching(/<(?:textarea|table)\b/)).toEqual([]);
    expect(filesMatching(/<input\b(?![^>]*\btype=["']hidden["'])/)).toEqual([]);
  });

  it('pins every hidden server-action field owner', () => {
    expect(filesMatching(/<input\b[^>]*\btype=["']hidden["']/)).toEqual(
      [...uiAdoptionRegistry.hiddenInputs].sort(),
    );
  });

  it('pins native and disabled-control title exceptions separately', () => {
    expect(filesMatching(/<[a-z][^>]*\btitle=/)).toEqual(
      exceptionFiles(uiAdoptionRegistry.nativeTitles),
    );
    expect(filesMatching(/\btitle=\{(?:disabled|view\.isSelf)\s*\?/)).toEqual(
      [...uiAdoptionRegistry.disabledControlTitles].sort(),
    );
  });

  it('keeps hand-built action semantics and primitive-owned tokens at zero', () => {
    expect(filesMatching(/\brole=["']button["']|role:\s*["']button["']/)).toEqual([]);
    expect(filesMatching(/<[a-z][^>]*\baria-pressed=/)).toEqual([]);
    expect(
      filesMatching(
        /text-empty|(?:bg|text|border)-(?:pill|chip)-|skeleton-shimmer|--pct|toast\.loading/,
      ),
    ).toEqual([]);
  });
});

describe('UI adoption CSS-family census', () => {
  it('contains no retired Phase 4 family', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    const retired = [
      'body-copy',
      'changelog-',
      'contact-',
      'content-browser',
      'devlog-prose',
      'hero-wordmark',
      'industry-hint',
      'industry-jobs',
      'industry-mono',
      'legal-prose',
      'account-menu',
      'nav-menu',
      'nav-tool',
      'run-as-menu-panel',
      'sites-card-',
      'sites-chip',
      'sites-filter',
      'sites-grid',
      'sites-reset',
      'sites-table-row',
      'sites-type',
      'status-chip',
      'tile-desc',
      'tool-tile',
    ];

    expect(retired.filter((family) => css.includes(`.${family}`))).toEqual([]);
  });

  it('allows only the recorded surviving page-family prefixes', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
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
