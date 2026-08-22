import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HOSTED_WIDGETS,
  WIDGET_HOST_FILES,
  classifyFeatureUiImports,
  collectHostSources,
  scanWidgetHosts,
  type ModuleResolver,
} from './__tests__/widget-host-registry';

const MAPPER_HOST = 'src/mapper/signatures/ActiveSiteViewer.tsx';

function resolveMap(files: Record<string, string>): ModuleResolver {
  return (fromFile, specifier) => files[`${fromFile}::${specifier}`] ?? null;
}

describe('classifyFeatureUiImports', () => {
  it('accepts the slice-root widget module and ignores feature .ts helpers', () => {
    const hits = classifyFeatureUiImports({
      host: MAPPER_HOST,
      source: `
        import { SiteCardWidget } from '@/features/wormhole-sites/widget';
        import { siteIdForSiteName } from '@/features/wormhole-sites/site-name-lookup';
        import type { SiteDetail } from '@/features/wormhole-sites/types';
      `,
      resolve: resolveMap({
        [`${MAPPER_HOST}::@/features/wormhole-sites/widget`]:
          'src/features/wormhole-sites/widget.tsx',
        [`${MAPPER_HOST}::@/features/wormhole-sites/site-name-lookup`]:
          'src/features/wormhole-sites/site-name-lookup.ts',
        [`${MAPPER_HOST}::@/features/wormhole-sites/types`]:
          'src/features/wormhole-sites/types.ts',
      }),
    });
    expect(hits).toEqual([
      {
        kind: 'widget',
        host: MAPPER_HOST,
        widget: 'src/features/wormhole-sites/widget.tsx',
      },
    ]);
  });

  it('flags a hosted feature component that is not the slice widget', () => {
    const hits = classifyFeatureUiImports({
      host: MAPPER_HOST,
      source: `import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';`,
      resolve: resolveMap({
        [`${MAPPER_HOST}::@/features/wormhole-sites/components/SiteCard`]:
          'src/features/wormhole-sites/components/SiteCard.tsx',
      }),
    });
    expect(hits).toEqual([
      {
        kind: 'illegal',
        host: MAPPER_HOST,
        module: 'src/features/wormhole-sites/components/SiteCard.tsx',
      },
    ]);
  });
});

describe('widget host census', () => {
  const hits = scanWidgetHosts();
  const widgets = [
    ...new Set(hits.filter((hit) => hit.kind === 'widget').map((hit) => hit.widget)),
  ].sort();
  const hosts = [
    ...new Set(hits.filter((hit) => hit.kind === 'widget').map((hit) => hit.host)),
  ].sort();
  const illegal = hits.filter((hit) => hit.kind === 'illegal');

  it('walks mapper and the widget preview', () => {
    expect(collectHostSources('src/mapper').length).toBeGreaterThan(0);
    expect(
      collectHostSources('src/app/(site)/preview/widgets'),
    ).toContain('src/app/(site)/preview/widgets/page.tsx');
  });

  it('lists every hosted widget and keeps the scanner on the known hosts', () => {
    expect(widgets).toEqual([...HOSTED_WIDGETS].sort());
    expect(hosts).toEqual([...WIDGET_HOST_FILES].sort());
    for (const widget of HOSTED_WIDGETS) {
      expect(existsSync(widget)).toBe(true);
    }
  });

  it('lets mapper and the widget preview host only src/features/<slice>/widget.tsx', () => {
    expect(illegal).toEqual([]);
  });
});
