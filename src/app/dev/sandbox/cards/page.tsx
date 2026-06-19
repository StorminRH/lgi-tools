import { PageShell } from '@/components/ui/page-shell';
import { MOCK_CARDS } from '../_shared/mock-build';
import { SandboxHeader, VariantFrame } from '../_shared/sandbox-ui';
import {
  AuroraPointer,
  FlatBaseline,
  GradientSheen,
  HoverGlowRing,
  InsetBevel,
  SoftElevation,
} from './card-variants';

// Six card depth/polish treatments, each shown with the same sample card so the
// elevation language is the only variable. Hover each to see its affordance.
// Static shell; the cards are client islands (hover/pointer effects).

const SAMPLE = MOCK_CARDS[0];

export default function CardsPage() {
  return (
    <PageShell>
      <div className="flex flex-col items-center pt-12 pb-20">
        <SandboxHeader
          title="Card Designs"
          subtitle="6 variants · same card · hover to see depth + affordance"
        />
        <div className="w-full max-w-[1100px] grid gap-6 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
        <VariantFrame tag="Card v1" title="Flat baseline" notes="Today’s treatment — border + section fill, no elevation. The control.">
          <FlatBaseline sample={SAMPLE} />
        </VariantFrame>
        <VariantFrame tag="Card v2" title="Soft elevation" notes="Layered drop shadow; lifts a few px on hover. Quiet, broadly applicable.">
          <SoftElevation sample={SAMPLE} />
        </VariantFrame>
        <VariantFrame tag="Card v3" title="Inset bevel" notes="Top highlight + inset bottom shadow — an engraved panel. Reads recessed, not raised.">
          <InsetBevel sample={SAMPLE} />
        </VariantFrame>
        <VariantFrame tag="Card v4" title="Hover glow ring" notes="Flat at rest; an ISK-green ring blooms on hover. Strong affordance for clickable tiles.">
          <HoverGlowRing sample={SAMPLE} />
        </VariantFrame>
        <VariantFrame tag="Card v5" title="Gradient sheen" notes="A diagonal highlight sweeps across on hover (over soft elevation). Premium feel; subtle.">
          <GradientSheen sample={SAMPLE} />
        </VariantFrame>
        <VariantFrame tag="Card v6" title="Aurora pointer glow" notes="A soft glow follows the cursor across the surface. Most interactive; cursor-only, so pair with v4’s ring for touch.">
          <AuroraPointer sample={SAMPLE} />
        </VariantFrame>
        </div>
      </div>
    </PageShell>
  );
}
