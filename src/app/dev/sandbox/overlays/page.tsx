import { SandboxHeader } from '../_shared/sandbox-ui';
import { OverlaysDemo } from './OverlaysDemo';

// OOB.2.1 — Base UI overlay proving harness. Unlinked dev page (the sandbox layout
// noindexes it). Deliberately NOT wrapped in PageShell: a bare shell keeps the CSP
// surface isolated to Base UI's own output and avoids the global header's DB reads,
// so `next dev` boots this page with no Docker/Convex. Static shell; the overlays
// are a client island (Portals/context). See README.md for the captured conventions.

export default function OverlaysPage() {
  return (
    <div className="flex flex-col items-center pt-12 pb-20 px-6">
      <SandboxHeader
        title="Base UI Overlays"
        subtitle="OOB.2.1 · proving Tooltip · Popover · Dialog · Menu render CSP-clean"
      />
      <div className="w-full max-w-[1100px] grid gap-6 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        <OverlaysDemo />
      </div>
      <p className="mt-10 max-w-[680px] text-center text-[11px] leading-[1.6] text-muted">
        Open each overlay. Zero CSP console violations confirms Base UI’s internally-set
        positioner styles are permitted by the post-OOB.1.1 <code>style-src</code>; our JSX
        carries no <code>style</code> attribute, so the real primitives (OOB.2.2–.4) need no
        lint exemption.
      </p>
    </div>
  );
}
