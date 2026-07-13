import type { ReactNode } from 'react';
import { ContentBrowser, landingContentSlug } from '@/components/ui/content-browser';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { APP_VERSION } from '@/config/app-version';
import { toChangelogDocuments, toChangelogNavModel } from '@/features/changelog/browser';
import { loadChangelog } from '@/features/changelog/load';

export default async function ChangelogLayout({ children }: { children: ReactNode }) {
  const model = toChangelogNavModel(toChangelogDocuments(await loadChangelog()));
  return (
    <PageShell>
      <PageHead
        crumb="changelog"
        title="Changelog"
        meta={
          <span>
            Current <b className="text-isk font-semibold">v{APP_VERSION}</b>
          </span>
        }
      />
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
