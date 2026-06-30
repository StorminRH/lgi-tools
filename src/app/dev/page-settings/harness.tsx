'use client';

// The disposable runtime consumer of the page-menu slot (ACCOUNT.4). Reads the
// resolved page-settings spec through usePageSettings() and renders its
// STRUCTURE as text — no real control (ACCOUNT.6) and no strip (ACCOUNT.7), just
// proof the route → spec → slot path resolves at runtime. Replaced by the real
// portrait menu in ACCOUNT.5.

import { PageMenuProvider, usePageSettings } from '@/components/PageMenuProvider';

function SlotReadout() {
  const spec = usePageSettings();
  if (!spec) {
    return <span className="text-muted">no spec</span>;
  }
  const controls = spec.controls ?? [];
  return (
    <div className="flex flex-col gap-1 text-[12px]">
      <div>
        <span className="text-muted">route </span>
        <span className="text-name">{spec.route}</span>
      </div>
      <div>
        <span className="text-muted">controls </span>
        {controls.length > 0 ? (
          <span>{controls.map((c) => `${c.key} (${c.placement})`).join(', ')}</span>
        ) : (
          <span className="text-muted">none</span>
        )}
      </div>
      <div>
        <span className="text-muted">strip </span>
        <span>{spec.strip ? spec.strip.surfaceId : 'none'}</span>
      </div>
    </div>
  );
}

// `/sites/30002` proves the prefix match (same spec as `/sites`); `/skills` and
// `/dev/page-settings` prove the empty case.
const SAMPLE_PATHS = ['/sites', '/sites/30002', '/skills', '/dev/page-settings'];

export function PageSettingsHarness() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
          Live route (this page&apos;s slot)
        </div>
        {/* No local provider — reads the global PageMenuProvider mounted in the
         * layout, resolving the live pathname (/dev/page-settings → no spec). */}
        <SlotReadout />
      </section>

      <section className="flex flex-col gap-3">
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
          Sample routes
        </div>
        {SAMPLE_PATHS.map((path) => (
          <div
            key={path}
            className="flex flex-col gap-1 border-l-2 border-border-soft pl-3"
          >
            <div className="text-[11px] text-muted font-mono">{path}</div>
            <PageMenuProvider pathname={path}>
              <SlotReadout />
            </PageMenuProvider>
          </div>
        ))}
      </section>
    </div>
  );
}
