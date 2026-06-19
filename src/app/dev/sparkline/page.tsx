import { PageShell } from '@/components/ui/page-shell';
import { SparklineDemo } from './sparkline-demo';

// Unlinked developer surface that proves the visx sparkline primitive renders
// with zero CSP violations. `noindex` keeps it out of search even on the
// canonical host; it is not linked from any navigation.
export const metadata = {
  title: 'Sparkline (dev)',
  robots: { index: false, follow: false },
};

export default function SparklineDevPage() {
  return (
    <PageShell>
      <div className="flex flex-col items-center pt-12 pb-20">
        <header className="w-full max-w-[680px] mb-6 pb-4 border-b border-border-soft">
          <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
            Sparkline
          </div>
          <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
            visx viz foundation · CSP proof primitive
          </div>
        </header>

        <div className="w-full max-w-[680px]">
          <SparklineDemo />
        </div>
      </div>
    </PageShell>
  );
}
