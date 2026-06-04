'use client';

import { useState } from 'react';
import { cn } from '@/components/ui/cn';
import { SAMPLE_BLUEPRINTS } from '../../_shared/build-spec';
import { MOCK_STRUCTURE } from '../../_shared/mock-build';
import { FlowConnectors, type FlowAnim } from '../FlowConnectors';

// The blueprints to compare, smallest → largest, with the Wolf gallery sample
// kept on the end as the mid-size reference.
const BLUEPRINTS = [
  ...SAMPLE_BLUEPRINTS,
  { id: 'wolf', label: 'Wolf', sub: 'Assault frigate', structure: MOCK_STRUCTURE },
];

const ANIMS: { id: FlowAnim; label: string }[] = [
  { id: 'zoom', label: 'Zoom' },
  { id: 'fade', label: 'Fade' },
  { id: 'slide', label: 'Slide' },
];

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 border cursor-pointer transition-colors',
        active
          ? 'border-border text-name bg-[rgba(255,255,255,0.05)]'
          : 'border-border-soft text-muted hover:text-name',
      )}
    >
      {children}
    </button>
  );
}

export function FlowExplorer() {
  const [blueprintId, setBlueprintId] = useState('rifter');
  const [anim, setAnim] = useState<FlowAnim>('zoom');
  const blueprint = BLUEPRINTS.find((b) => b.id === blueprintId) ?? BLUEPRINTS[0];

  return (
    <div className="w-full max-w-[1100px]">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div className="flex flex-col gap-2">
          <span className="text-[9px] tracking-[0.14em] uppercase text-muted">Blueprint</span>
          <div className="flex flex-wrap gap-1.5">
            {BLUEPRINTS.map((b) => (
              <Toggle key={b.id} active={b.id === blueprintId} onClick={() => setBlueprintId(b.id)}>
                {b.label}
              </Toggle>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[9px] tracking-[0.14em] uppercase text-muted">Drill animation</span>
          <div className="flex gap-1.5">
            {ANIMS.map((a) => (
              <Toggle key={a.id} active={a.id === anim} onClick={() => setAnim(a.id)}>
                {a.label}
              </Toggle>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-baseline gap-2.5 mb-3">
        <span className="font-display text-[14px] text-name tracking-[0.04em]">{blueprint.label}</span>
        <span className="text-[10px] tracking-[0.1em] uppercase text-muted">{blueprint.sub}</span>
        <span className="ml-auto text-[10px] text-muted">click a node to zoom into its build</span>
      </div>

      <div className="border border-border-soft bg-section rounded-[4px] p-5">
        <FlowConnectors key={blueprintId} structure={blueprint.structure} anim={anim} />
      </div>
    </div>
  );
}
