import { SandboxHeader } from '../_shared/sandbox-ui';
import { PricesDemo } from './PricesDemo';

// Ten ways the hero ISK figure can transition from last-known to confirmed-live.
// Static shell; the animations are client islands driven by timers over a
// hardcoded sample figure (no request-time data).

export default function PricesPage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <SandboxHeader
        title="Price-update Animations"
        subtitle="10 variants · pending → settle · auto-loops, or trigger each one"
      />
      <PricesDemo />
    </div>
  );
}
