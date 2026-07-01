import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { DevlogNav } from '@/features/devlog/components/DevlogNav';
import { NavTree } from '@/features/devlog/components/NavTree';
import { loadDevlog } from '@/features/devlog/load';
import { toNavModel } from '@/features/devlog/parse';

// Shared frame for every /devlog document: the static page shell + head, and the
// file-browser rail beside the swapped-in document. The rail lives here (not in the
// page) so its folder open/closed state survives soft navigation between documents.
// The active-document highlight is the only request-time bit — DevlogNav reads the
// path and is <Suspense>-isolated so the shell stays static (the NavTools pattern).
export default async function DevlogLayout({ children }: { children: ReactNode }) {
  const model = toNavModel(await loadDevlog());
  return (
    <PageShell>
      <PageHead crumb="devlog" title="Under the Hood" meta={<span>a dev log</span>} />
      <div className="devlog-layout pb-16">
        <details className="devlog-rail" open>
          <summary className="devlog-rail-toggle list-none [&::-webkit-details-marker]:hidden">
            Documents
          </summary>
          <div className="devlog-rail-body">
            <Suspense fallback={<NavTree model={model} activeSlug={null} />}>
              <DevlogNav model={model} />
            </Suspense>
          </div>
        </details>
        <div className="devlog-content">{children}</div>
      </div>
    </PageShell>
  );
}
