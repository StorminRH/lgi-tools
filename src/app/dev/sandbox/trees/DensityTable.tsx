'use client';

import { useState } from 'react';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { TONE_HEX } from './tree-shared';
import type { BlueprintStructure } from '@/features/industry-planner/types';
import { flattenTree, formatNodeQty } from './tree-shared';

// Tree v5 — Density Table. The whole tree flattened to a scannable table, depth
// shown by indentation + a tone rail, with a comfortable ↔ compact density
// toggle so the operator can feel both a roomy and a power-user spacing.

const INDENT: Record<number, string> = {
  0: 'pl-2',
  1: 'pl-7',
  2: 'pl-12',
  3: 'pl-[68px]',
};

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'text-[9px] tracking-[0.12em] uppercase px-2.5 py-1 border cursor-pointer transition-colors',
        active
          ? 'border-border text-name bg-[rgba(255,255,255,0.05)]'
          : 'border-border-soft text-muted hover:text-name',
      )}
    >
      {children}
    </button>
  );
}

export function DensityTable({ structure }: { structure: BlueprintStructure }) {
  const [compact, setCompact] = useState(false);
  const rows = flattenTree(structure.buildTree, structure.buildNodeDisplay);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[9px] tracking-[0.12em] uppercase text-muted mr-1">Density</span>
        <ToggleButton active={!compact} onClick={() => setCompact(false)}>
          Comfortable
        </ToggleButton>
        <ToggleButton active={compact} onClick={() => setCompact(true)}>
          Compact
        </ToggleButton>
      </div>

      <div className="font-mono border-t border-border-soft">
        {rows.map((r, i) => (
          <div
            key={`${r.node.typeId}-${i}`}
            className={cn(
              'flex items-center gap-2 border-b border-border-soft hover:bg-[rgba(255,255,255,0.018)]',
              compact ? 'py-[3px] text-[11px]' : 'py-[7px] text-[12px]',
              INDENT[r.depth] ?? INDENT[3],
            )}
          >
            <span
              className="inline-block w-[6px] h-[6px] rounded-full shrink-0"
              data-tone-dot
              ref={(el) => el?.style.setProperty('background-color', TONE_HEX[r.display.tone])}
              aria-hidden
            />
            <span className="text-name truncate">{r.display.name}</span>
            {!compact && <Pill tone={r.display.tone}>{r.display.label}</Pill>}
            <span className="ml-auto text-muted whitespace-nowrap pr-1">
              × {formatNodeQty(r.node.quantity)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
