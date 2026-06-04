'use client';

import { useState } from 'react';
import { cn } from '@/components/ui/cn';
import type { BlueprintStructure } from '@/features/industry-planner/types';
import { FlowConnectors } from '../FlowConnectors';

export interface FlowBlueprint {
  id: string;
  label: string;
  sub: string;
  structure: BlueprintStructure;
}

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

export function FlowExplorer({ blueprints }: { blueprints: FlowBlueprint[] }) {
  const [id, setId] = useState(blueprints[0]?.id);
  const blueprint = blueprints.find((b) => b.id === id) ?? blueprints[0];

  if (!blueprint) {
    return (
      <p className="w-full max-w-[1100px] text-[11px] text-muted">
        No blueprint data available (the SDE tables may not be populated in this environment).
      </p>
    );
  }

  return (
    <div className="w-full max-w-[1100px]">
      <div className="flex flex-col gap-2 mb-5">
        <span className="text-[9px] tracking-[0.14em] uppercase text-muted">Blueprint · real SDE data</span>
        <div className="flex flex-wrap gap-1.5">
          {blueprints.map((b) => (
            <Toggle key={b.id} active={b.id === blueprint.id} onClick={() => setId(b.id)}>
              {b.label}
            </Toggle>
          ))}
        </div>
      </div>

      <div className="flex items-baseline gap-2.5 mb-3">
        <span className="font-display text-[14px] text-name tracking-[0.04em]">{blueprint.label}</span>
        <span className="text-[10px] tracking-[0.1em] uppercase text-muted">{blueprint.sub}</span>
        <span className="ml-auto text-[10px] text-muted">click a node to zoom into its build</span>
      </div>

      <FlowConnectors key={blueprint.id} structure={blueprint.structure} />
    </div>
  );
}
