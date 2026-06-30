import { PageShell } from '@/components/ui/page-shell';
import { PageSettingsHarness } from './harness';

// Unlinked developer surface (ACCOUNT.4) that proves the page-menu slot resolves
// a route's page-settings spec at runtime. Disposable — ACCOUNT.5 replaces it
// with the real portrait menu. `noindex` keeps it out of search even on the
// canonical host; it is not linked from any navigation.
export const metadata = {
  title: 'Page settings slot (dev)',
  robots: { index: false, follow: false },
};

export default function PageSettingsDevPage() {
  return (
    <PageShell>
      <div className="flex flex-col items-center pt-12 pb-20">
        <header className="w-full max-w-[680px] mb-6 pb-4 border-b border-border-soft">
          <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
            Page settings slot
          </div>
          <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
            ACCOUNT.4 · route → spec → slot proof
          </div>
        </header>

        <div className="w-full max-w-[680px]">
          <PageSettingsHarness />
        </div>
      </div>
    </PageShell>
  );
}
