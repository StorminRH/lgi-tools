import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { LoadingLabel } from '@/components/ui/loading-label';
import { Skeleton } from '@/components/ui/skeleton';
import { PrototypeGroup, VariantCard } from './gallery';

/*
 * Every card fills the same fallback: a list card of three rows, a stack of
 * three blocks, and the loading label. Only the bone, motion, and label look
 * differ, so whichever is picked drops into every existing Suspense fallback.
 */

const ROWS = [['w-2/5', 'w-16'], ['w-3/5', 'w-12'], ['w-1/3', 'w-20']] as const;
const STACK = ['h-3 w-1/3', 'h-6 w-3/5', 'h-12 w-full'] as const;

function Fallback({ bone, label }: { bone: string; label: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        {ROWS.map(([left, right]) => (
          <div key={left} className="flex justify-between gap-3 border-b border-border-soft px-4 py-3 last:border-0">
            <span className={cn(bone, 'h-3', left)} />
            <span className={cn(bone, 'h-3', right)} />
          </div>
        ))}
      </Card>
      <div className="flex flex-col gap-2.5">
        {STACK.map((size) => <span key={size} className={cn(bone, size)} />)}
        {label.includes('pt-load-dots') ? (
          <span className={label}>
            Loading <span className="pt-dots" aria-hidden><i /><i /><i /></span>
          </span>
        ) : (
          <span className={label}>Loading…</span>
        )}
      </div>
    </div>
  );
}

function CurrentFallback() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        {ROWS.map(([left, right]) => (
          <div key={left} className="flex justify-between gap-3 border-b border-border-soft px-4 py-3 last:border-0">
            <Skeleton className={`h-3 ${left}`} />
            <Skeleton className={`h-3 ${right}`} />
          </div>
        ))}
      </Card>
      <div className="flex flex-col gap-2.5">
        {STACK.map((size) => <Skeleton key={size} className={size} />)}
        <LoadingLabel />
      </div>
    </div>
  );
}

export function SkeletonsGroup() {
  return (
    <PrototypeGroup
      id="skeletons"
      title="Loading skeletons"
      today="Every card shows the same Suspense fallback (Skeleton + LoadingLabel). Only the look and motion change."
    >
      <VariantCard letter="Now" name="Linear shimmer" pitch="The shipping Skeleton and LoadingLabel: grey bars, a fast linear shimmer, and an uppercase LOADING… label.">
        <CurrentFallback />
      </VariantCard>
      <VariantCard letter="A" name="Soft glass shimmer" pitch="Rounded-end bones with a wide, slow, eased sheen. Calm enough to sit on glass cards.">
        <Fallback bone="pt-skel pt-skel-a" label="pt-load-label" />
      </VariantCard>
      <VariantCard letter="B" name="Breathing cascade" pitch="No sweep: bones breathe in turn, top to bottom, so loading reads as order rather than flicker.">
        <Fallback bone="pt-skel pt-skel-b" label="pt-load-label pt-load-breathe" />
      </VariantCard>
      <VariantCard letter="C" name="Aurora sweep" pitch="One continuous aurora-tinted light passes across every bone on the screen at once, like a scanner pass.">
        <Fallback bone="pt-skel pt-skel-c" label="pt-load-label pt-load-gradient" />
      </VariantCard>
      <VariantCard letter="D" name="Frosted bones" pitch="Bones become tiny glass slabs with a lit top edge and a slow glow pulse, rather than flat grey.">
        <Fallback bone="pt-skel pt-skel-glass" label="pt-load-label" />
      </VariantCard>
      <VariantCard letter="E" name="Still bones + dots" pitch="The bones stay still and quiet; the only motion is three bouncing dots on the label.">
        <Fallback bone="pt-skel pt-skel-e" label="pt-load-label pt-load-dots" />
      </VariantCard>
    </PrototypeGroup>
  );
}
