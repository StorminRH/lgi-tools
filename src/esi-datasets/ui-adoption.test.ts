import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  deadAllowlistEntries,
  handRolledTypeRoles,
  unexpectedFamilies,
  uppercaseCount,
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

// The type-role census reads the ui layer too, the role owner included: no
// role sets text in capitals, and only the role owner may spell a tracked
// class string.
const TYPE_ROLE_OWNER = 'src/components/ui/type-roles.ts';
const ALL_SOURCES = listSourceFiles({
  roots: ['src'],
  extensions: ['.ts', '.tsx'],
  skipDirectories: ['node_modules', '__fixtures__', '__tests__', '_generated'],
  skipSuffixes: ['.test.ts', '.test.tsx', '.d.ts'],
});
const TYPE_ROLE_SOURCES = ALL_SOURCES.filter((file) => file !== TYPE_ROLE_OWNER);

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

const STYLESHEETS = listSourceFiles({ roots: ['src'], extensions: ['.css'] });

function allStylesheets(): string {
  return STYLESHEETS.map((file) => readFileSync(file, 'utf8')).join('\n');
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

describe('UI adoption type-role census', () => {
  it('pins how many places in each file set capitals to the recorded brand marks and EVE codes', () => {
    const scripts = ALL_SOURCES.map((file): [string, number] => [
      file,
      uppercaseCount(stripComments(readFileSync(file, 'utf8')), 'script'),
    ]);
    const stylesheets = STYLESHEETS.map((file): [string, number] => [
      file,
      uppercaseCount(stripComments(readFileSync(file, 'utf8')), 'css'),
    ]);
    const found = Object.fromEntries(
      [...scripts, ...stylesheets].filter(([, count]) => count > 0),
    );
    const recorded = Object.fromEntries(
      uiAdoptionRegistry.uppercaseExceptions.map(({ file, count }) => [file, count]),
    );

    expect(found).toEqual(recorded);
  });

  it('counts an uppercase class at any variant, in any literal, or as a style value', () => {
    const source = [
      '<span className="font-ui uppercase text-micro">a</span>',
      "const head = 'md:hover:uppercase text-label';",
      "const style = { textTransform: 'uppercase' };",
      '<a aria-label="Don\'t" className="uppercase">b</a>',
      '<p>Don\'t</p><span className="!uppercase">c</span>',
      "const mark = \"before:content-['/'] uppercase\";",
      'const wrapped = `',
      '  uppercase text-label',
      '`;',
      "const imp = 'uppercase! text-label';",
      "const imp2 = 'md:!uppercase';",
      '<b className="[text-transform:uppercase] x">d</b>',
      "const chip = cn('font-ui', active && 'lg:uppercase', size);",
      'const badge = cva(',
      "  'inline-flex uppercase',",
      "  { variants: { tone: { loud: 'tracking-label uppercase!' } } },",
      ');',
      '<p className={`${link} md:uppercase`}>e</p>',
      "const nested = `${cn('uppercase')} text-label`;",
    ].join('\n');

    expect(uppercaseCount(source, 'script')).toBe(15);
  });

  it('does not count the word in copy, as JSX text or in a copy string', () => {
    const source = [
      '<p>Use uppercase letters</p>',
      '<p>',
      '  Shown in uppercase',
      '</p>',
      "const copy = 'Shown in uppercase.';",
      'const hint = `Hi ${name}, set in uppercase`;',
      "const note = 'not uppercase-ish';",
    ].join('\n');

    expect(uppercaseCount(source, 'script')).toBe(0);
  });

  it('counts a capitals declaration or an applied uppercase class in a stylesheet', () => {
    const css = [
      '.a { text-transform: uppercase; }',
      '.b { @apply font-ui uppercase text-label; }',
      '.c { text-transform: none; }',
      '.uppercase-ish { color: red; }',
    ].join('\n');

    expect(uppercaseCount(css, 'css')).toBe(2);
  });

  it('pins how many class strings in each file hand-roll an eyebrow or title role', () => {
    const found = Object.fromEntries(
      TYPE_ROLE_SOURCES.map((file): [string, number] => [
        file,
        handRolledTypeRoles(stripComments(readFileSync(file, 'utf8'))).length,
      ]).filter(([, count]) => count > 0),
    );
    const recorded = Object.fromEntries(
      uiAdoptionRegistry.typeRoleExceptions.map(({ file, count }) => [file, count]),
    );

    expect(found).toEqual(recorded);
  });

  it('finds a tracking step beside a label size or capitals, and off-step tracking, not role calls', () => {
    const source = [
      '<span className="text-eyebrow tracking-optical text-muted">a</span>',
      "const head = 'tracking-optical font-semibold md:text-caption';",
      '<span className="font-data text-small tracking-normal">b</span>',
      '<span className="text-bar tracking-optical">c</span>',
      '<span className="text-lead uppercase tracking-copy">d</span>',
      '<p className={`${link} text-micro tracking-[0.07em]`}>e</p>',
      '<span className="text-eyebrow text-muted">f</span>',
      '<span className="text-ui tracking-optical text-muted">g</span>',
      "<span className={eyebrow({ size: 'micro' })}>h</span>",
    ].join('\n');

    expect(handRolledTypeRoles(source)).toEqual([
      'text-eyebrow tracking-optical text-muted',
      'tracking-optical font-semibold md:text-caption',
      'font-data text-small tracking-normal',
      'text-bar tracking-optical',
      'text-lead uppercase tracking-copy',
      '${link} text-micro tracking-[0.07em]',
    ]);
  });
});
