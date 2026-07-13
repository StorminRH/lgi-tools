import type { ReactNode } from 'react';
import { ContentBrowser, landingContentSlug } from '@/components/ui/content-browser';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { loadDevlog } from '@/features/devlog/load';
import { toNavModel } from '@/features/devlog/parse';

// Shared frame for every /devlog document: the static page shell + head, and the
// file-browser rail beside the swapped-in document. The rail lives here (not in the
// page) so its folder open/closed state survives soft navigation between documents.
// The active-document highlight is the only request-time bit — ContentBrowser reads
// the path inside its <Suspense>-isolated client island so the shell stays static.
export default async function DevlogLayout({ children }: { children: ReactNode }) {
  const model = toNavModel(await loadDevlog());
  return (
    <PageShell>
      <PageHead crumb="devlog" title="Under the Hood" meta={<span>a dev log</span>} />
      <ContentBrowser
        basePath="/devlog"
        railLabel="Documents"
        navigationLabel="Dev log documents"
        landingSlug={landingContentSlug(model)}
        model={model}
      >
        {children}
      </ContentBrowser>
    </PageShell>
  );
}
