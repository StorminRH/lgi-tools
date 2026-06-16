'use client';

import type { PointerEvent } from 'react';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk } from '@/lib/format/isk';
import type { CardSample } from '../_shared/mock-build';

// The home/sites card explored for depth + polish. All six share one body; only
// the wrapper's elevation/hover treatment differs, so the operator compares the
// depth language, not the content. Every effect is a stylesheet class (see
// sandbox.css); the aurora variant tracks the cursor via ref.style.setProperty
// (CSP-clean — no inline style attribute).

function CardBody({ sample }: { sample: CardSample }) {
  return (
    <div className="p-[18px] flex flex-col gap-3 font-mono">
      <div className="flex items-start gap-3">
        <TypeIcon typeId={sample.typeId} size={40} mono={sample.title.slice(0, 2)} />
        <div className="min-w-0">
          <div className="font-display font-bold text-[15px] text-name leading-tight truncate">
            {sample.title}
          </div>
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted mt-0.5">
            {sample.typeLabel}
          </div>
        </div>
        <div className="ml-auto text-right shrink-0">
          <div className="font-bold text-[16px] text-isk tabular-nums">{formatIsk(sample.isk)}</div>
          <div className="text-[9px] uppercase tracking-[0.1em] text-muted">est. value</div>
        </div>
      </div>
      <p className="text-[11px] text-muted leading-relaxed">{sample.sub}</p>
      <div className="flex gap-1 pt-2.5 border-t border-border-soft">
        {sample.tags.map((t) => (
          <Pill key={t.label} tone={t.tone}>
            {t.label}
          </Pill>
        ))}
      </div>
    </div>
  );
}

const BASE = 'border border-border bg-section rounded-[4px] overflow-hidden';

export function FlatBaseline({ sample }: { sample: CardSample }) {
  return (
    <div className={BASE}>
      <CardBody sample={sample} />
    </div>
  );
}

export function SoftElevation({ sample }: { sample: CardSample }) {
  return (
    <div className={cn(BASE, 'sbx-card-elev')}>
      <CardBody sample={sample} />
    </div>
  );
}

export function InsetBevel({ sample }: { sample: CardSample }) {
  return (
    <div className={cn(BASE, 'sbx-card-bevel')}>
      <CardBody sample={sample} />
    </div>
  );
}

export function HoverGlowRing({ sample }: { sample: CardSample }) {
  return (
    <div className={cn(BASE, 'sbx-card-glow')}>
      <CardBody sample={sample} />
    </div>
  );
}

export function GradientSheen({ sample }: { sample: CardSample }) {
  return (
    <div className={cn(BASE, 'sbx-card-sheen', 'sbx-card-elev')}>
      <CardBody sample={sample} />
    </div>
  );
}

export function AuroraPointer({ sample }: { sample: CardSample }) {
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };
  return (
    <div className={cn(BASE, 'sbx-card-aurora', 'sbx-card-glow')} onPointerMove={onMove}>
      <CardBody sample={sample} />
    </div>
  );
}
