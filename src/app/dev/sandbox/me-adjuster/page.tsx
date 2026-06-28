import { SandboxHeader } from '../_shared/sandbox-ui';
import { MeAdjusterDemo } from './MeAdjusterDemo';

// 3.7.5.4 — per-node ME adjuster UX exploration. Unlinked dev page (the sandbox
// noindexes it); deliberately NOT wrapped in PageShell so `next dev` boots it with
// no Docker/Convex. Static shell; the five adjuster variants are a client island
// over a hand-authored mock build, driven by the real `me-overrides` helpers.

export default function MeAdjusterPage() {
  return (
    <div className="flex flex-col items-center px-6 pb-20 pt-12">
      <SandboxHeader
        title="ME Adjuster Variations"
        subtitle="3.7.5.4 · 5 patterns for overriding a node's material efficiency (0–10) · owned auto-fill"
      />
      <div className="grid w-full max-w-[1100px] grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
        <MeAdjusterDemo />
      </div>
      <p className="mt-10 max-w-[680px] text-center text-[11px] leading-[1.6] text-muted">
        Every variant shows the same mock build: an owned component (blue), an unowned one
        (faint), and an owned blueprint already overridden to a manual value (orange). Adjust any
        node, then reset — a manual value is always shown distinctly from an owned one, and never
        masquerades as owned.
      </p>
    </div>
  );
}
