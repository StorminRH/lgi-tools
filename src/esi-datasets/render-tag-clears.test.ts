import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles } from '@/lib/__tests__/source-scan';
import { renderReach } from './__tests__/render-reach';

/**
 * revalidateTag throws during a page render ("used revalidateTag during
 * render which is unsupported"), and a refresh a render schedules with
 * after() is no safer. Tag clears belong to route handlers and Server
 * Functions. This census follows every symbol that can reach
 * revalidateTag or updateTag, through store commits and scheduled
 * refreshes, and holds every page-render file clear of all of them: a
 * render reads the stored copy (readCorpViewer, the structures first draw)
 * and the page's live read refreshes it from a route handler.
 */

const PRODUCTION_SOURCES = listSourceFiles({
  roots: ['src'],
  extensions: ['.ts', '.tsx'],
  skipDirectories: ['node_modules', '__fixtures__', '__tests__', '_generated'],
  skipSuffixes: ['.test.ts', '.test.tsx', '.d.ts'],
});

/**
 * The Better Auth instance holds the sign-in callbacks (character proof,
 * affiliation refresh) that clear tags, but Better Auth runs them from its
 * own route handler; a render only reads the session through it.
 */
const BOUNDARIES = new Set(['src/composition/auth.ts#auth']);

const reach = renderReach(new Map(PRODUCTION_SOURCES.map((file) => [file, readFileSync(file, 'utf8')] as const)), BOUNDARIES);

/** A file a page render runs: under src/app outside the API, or a server .tsx anywhere outside it. Route handlers and Server Functions may clear tags. */
function isRenderFile(file: string): boolean {
  if (file.startsWith('src/app/api/') || /\/route\.tsx?$/.test(file)) return false;
  if (reach.directive(file) !== null) return false;
  return file.startsWith('src/app/') || file.endsWith('.tsx');
}

const RENDER_FILES = PRODUCTION_SOURCES.filter(isRenderFile);

describe('cache tag clears stay out of page renders', () => {
  it('follows the store commit and the scheduled refreshes to revalidateTag', () => {
    expect([...reach.clearing]).toEqual(expect.arrayContaining([
      'src/lib/cache-expiry.ts#expireNow',
      'src/data/esi-store/index.ts#commit',
      'src/composition/corp-viewer.ts#resolveCorpViewer',
      'src/composition/sync/corp-structures-sync.ts#getCorpStructuresPageData',
      'src/data/market-prices/refresh-on-view.ts#getLivePrices',
    ]));
  });

  it('keeps the render-time readers clear of every tag clear', () => {
    for (const symbol of [
      'src/composition/corp-viewer.ts#readCorpViewer',
      'src/composition/sync/corp-structures-sync.ts#getCorpStructuresFirstDraw',
      'src/data/eve-status/on-view.ts#getServerStatusOnView',
    ]) {
      expect(reach.clearing.has(symbol), symbol).toBe(false);
    }
  });

  it('finds the render files', () => {
    expect(RENDER_FILES).toEqual(expect.arrayContaining([
      'src/app/(site)/industry/CustomStructuresContent.tsx',
      'src/app/(site)/settings/corporations/page.tsx',
      'src/components/composition/AppHeader.tsx',
    ]));
  });

  it('keeps a boundary only while it holds clearing code', () => {
    expect([...reach.heldBoundaries]).toEqual([...BOUNDARIES]);
  });

  it('lets no page-render file reach a tag clear', () => {
    expect(reach.offenders(RENDER_FILES)).toEqual([]);
  });
});

describe('renderReach seeded cases', () => {
  const modules = new Map([
    ['src/lib/clear.ts', "import { revalidateTag } from 'next/cache';\nexport function clearIt(tag: string) { revalidateTag(tag, { expire: 0 }); }\n"],
    ['src/lib/index.ts', "export { clearIt as clear } from './clear';\nexport * from './safe';\n"],
    ['src/lib/safe.ts', 'export function readIt() { return 1; }\n'],
    ['src/lib/refresh.ts', "import { after } from 'next/server';\nimport { clear } from '@/lib';\nconst later = () => clear('t');\nexport function scheduleIt() { after(later); }\n"],
    ['src/lib/actions.ts', "'use server';\nimport { clear } from '@/lib';\nexport async function act() { clear('t'); }\n"],
    ['src/app/page.tsx', "import { scheduleIt } from '@/lib/refresh';\nimport { readIt } from '@/lib';\nimport { act } from '@/lib/actions';\nexport default function Page() { scheduleIt(); return <form action={act}>{readIt()}</form>; }\n"],
    ['src/app/other.tsx', "import { readIt } from '@/lib';\nimport { container } from '@/lib/container';\nconst member = { scheduleIt: 1 };\nexport default function Other() { return <p>{readIt() + member.scheduleIt + container.read()}</p>; }\n"],
    ['src/lib/container.ts', "import { clear } from '@/lib';\nexport const container = { onSignIn: () => clear('t'), read: () => 1 };\n"],
  ]);
  const seeded = renderReach(modules, new Set(['src/lib/container.ts#container']));

  it('follows re-exports, scheduled callbacks and local helpers, and spares Server Functions', () => {
    expect(seeded.clearing.has('src/lib/clear.ts#clearIt')).toBe(true);
    expect(seeded.clearing.has('src/lib/refresh.ts#later')).toBe(true);
    expect(seeded.clearing.has('src/lib/refresh.ts#scheduleIt')).toBe(true);
    expect(seeded.clearing.has('src/lib/actions.ts#act')).toBe(false);
    expect(seeded.clearing.has('src/lib/safe.ts#readIt')).toBe(false);
    expect(seeded.clearing.has('src/lib/container.ts#container')).toBe(false);
    expect(renderReach(modules).clearing.has('src/lib/container.ts#container')).toBe(true);
    expect([...renderReach(modules, new Set(['src/lib/safe.ts#readIt', 'src/lib/container.ts#container'])).heldBoundaries]).toEqual([
      'src/lib/container.ts#container',
    ]);
    expect(seeded.directive('src/lib/actions.ts')).toBe('use server');
  });

  it('names the render file and the path each clearing import takes, ignoring member names and boundaries', () => {
    expect(seeded.offenders(['src/app/page.tsx', 'src/app/other.tsx'])).toEqual([
      'src/app/page.tsx: src/lib/refresh.ts#scheduleIt > src/lib/refresh.ts#later > src/lib/clear.ts#clearIt > next/cache#revalidateTag',
    ]);
  });
});
