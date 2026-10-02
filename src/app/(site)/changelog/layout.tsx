import type { ReactNode } from 'react';
import { ContentBrowser, landingContentSlug } from '@/components/ui/content-browser';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { toChangelogDocuments, toChangelogNavModel } from '@/features/changelog/browser';
import { loadChangelog } from '@/features/changelog/load';

export default async function ChangelogLayout({ children }: { children: ReactNode }) {
  const model = toChangelogNavModel(toChangelogDocuments(await loadChangelog()));
  return (
    <PageShell mode="workspace">
      <PageHead size="hero" title="Changelog" />
      <ContentBrowser
        basePath="/changelog"
        railLabel="Versions"
        navigationLabel="Changelog versions"
        landingSlug={landingContentSlug(model)}
        model={model}
      >
        {children}
      </ContentBrowser>
    </PageShell>
  );
}
