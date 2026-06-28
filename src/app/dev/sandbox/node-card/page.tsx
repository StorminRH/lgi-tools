import { SandboxHeader } from '../_shared/sandbox-ui';
import { NodeCardDemo } from './NodeCardDemo';

// 3.7.5.7 — build-plan node-card re-layout exploration. Unlinked dev page (the
// sandbox noindexes it); deliberately NOT wrapped in PageShell so `next dev` boots it
// with no Docker/Convex. Static shell; the cards are a client island driven by the
// real NodeCard + inline ME/TE fields over a hand-authored mock build.

export default function NodeCardPage() {
  return (
    <div className="flex flex-col items-center px-6 pb-20 pt-12">
      <SandboxHeader
        title="Node Card Re-layout"
        subtitle="3.7.5.7 · inline ME/TE fields (scroll or type) · ISK value top-right · QTY progress ring (empty placeholder) with owner/location on hover"
      />
      <NodeCardDemo />
      <p className="mt-10 max-w-[680px] text-center text-[11px] leading-[1.6] text-muted">
        The same mock build at two column widths. Each manufacturable node carries inline ME
        (gem) and TE (hourglass) fields — blue is the owned value, orange a manual what-if, faint
        is unowned; scroll, arrow, or type to change one, then ↺ to revert. A raw (Tritanium) has
        no efficiency fields. Hover the QTY ring for owner / location / needed.
      </p>
    </div>
  );
}
