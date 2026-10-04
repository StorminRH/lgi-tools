import type { MetadataRoute } from 'next';
import { cacheLife, cacheTag } from 'next/cache';
import { SITE_URL } from '@/config/site-url';
import { toChangelogDocuments } from '@/features/changelog/browser';
import { loadChangelog } from '@/features/changelog/load';
import type { CodexIndexRow } from '@/features/codex/index-search';
import { codexCacheTags } from '@/features/codex/queries';
import { CODEX_SUBJECT_KINDS, codexKindHref, codexPageHref } from '@/features/codex/subjects';
import { listCodexIndex } from './codex-templates';

export type SitemapInputs = {
  codex: readonly Pick<CodexIndexRow, 'kind' | 'key'>[];
  changelog: { slug: string; updated: string }[];
};

export function buildSitemapEntries({
  codex,
  changelog,
}: SitemapInputs): MetadataRoute.Sitemap {
  const latestChangelogDate = changelog[0]?.updated;
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/sites`, changeFrequency: 'weekly', priority: 0.9 },
    {
      url: `${SITE_URL}/changelog`,
      ...(latestChangelogDate ? { lastModified: latestChangelogDate } : {}),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    { url: `${SITE_URL}/legal`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/contact`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  const codexRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/codex`, changeFrequency: 'weekly', priority: 0.8 },
    ...CODEX_SUBJECT_KINDS.map((kind) => ({
      url: `${SITE_URL}${codexKindHref(kind)}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...codex.map((subject) => ({
      url: `${SITE_URL}${codexPageHref(subject)}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];

  const changelogRoutes: MetadataRoute.Sitemap = changelog
    .slice(1)
    .map(({ slug, updated }) => ({
      url: `${SITE_URL}/changelog/${slug}`,
      lastModified: updated,
      changeFrequency: 'monthly',
      priority: 0.3,
    }));

  return [...staticRoutes, ...codexRoutes, ...changelogRoutes];
}

export async function getSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheLife('max');
  cacheTag(codexCacheTags.index);

  const [codex, changelogMasters] = await Promise.all([listCodexIndex(), loadChangelog()]);
  const changelog = toChangelogDocuments(changelogMasters).flatMap(({ slug, master }) => {
    const updated = master.subVersions[0]?.date;
    return updated ? [{ slug, updated }] : [];
  });

  return buildSitemapEntries({ codex, changelog });
}
