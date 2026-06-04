'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { TypeIcon } from '@/components/ui/type-icon';
import { activityLabel, marginToneClass } from '@/features/industry-planner/industry-styles';
import type { BlueprintStructure } from '@/features/industry-planner/types';
import { formatIsk, formatPct, formatQuantity } from '@/lib/format';
import { FlowConnectors } from '../trees/FlowConnectors';

// A mockup of the real /industry/[id] planner page, so the hybrid build view can
// be seen in context (hero + page chrome). The hero mirrors BlueprintHero but
// takes static summary numbers instead of the streaming pricing store; the build
// plan is the hybrid FlowConnectors, drawn natively (no viewport box).

export interface MockSummary {
  inputCost: number;
  revenue: number;
  margin: number;
  marginPct: number;
}

export interface MockBlueprint {
  id: string;
  label: string;
  sub: string;
  structure: BlueprintStructure;
  summary: MockSummary;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="text-[13px] font-semibold text-isk whitespace-nowrap">{value}</div>
    </div>
  );
}

export function PlannerMock({ blueprints }: { blueprints: MockBlueprint[] }) {
  const [id, setId] = useState(blueprints[0]?.id);
  const bp = blueprints.find((b) => b.id === id) ?? blueprints[0];

  if (!bp) {
    return (
      <p className="w-full max-w-[1124px] text-[11px] text-muted">
        No blueprint data available in this environment.
      </p>
    );
  }
  const { structure, summary } = bp;

  return (
    <div className="w-full max-w-[1124px]">
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted mr-1">Mock planner ·</span>
        {blueprints.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setId(b.id)}
            aria-pressed={b.id === bp.id}
            className={cn(
              'text-[10px] uppercase tracking-[0.1em] px-3 py-1.5 border cursor-pointer transition-colors',
              b.id === bp.id
                ? 'border-border text-name bg-[rgba(255,255,255,0.05)]'
                : 'border-border-soft text-muted hover:text-name',
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <Link
          href="/dev/sandbox"
          className="inline-flex items-center min-h-[40px] text-[10px] tracking-[0.12em] uppercase text-muted"
        >
          ← UX Sandbox
        </Link>
      </div>

      {/* Hero — mirrors BlueprintHero (static mock numbers). */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-[1.5px] border-border bg-bg px-[18px] py-[14px] font-mono">
        <TypeIcon
          typeId={structure.product.typeId}
          variant="render"
          size={64}
          alt={structure.product.name}
          mono={structure.product.name.slice(0, 2)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-display font-bold text-[20px] leading-[1.1] text-name">
              {structure.product.name}
            </span>
            <Pill tone="blue">{activityLabel(structure.activityId)}</Pill>
          </div>
          <div className="text-[11px] text-muted mt-1">
            Builds {formatQuantity(structure.product.quantityPerRun)} per run · margin before job fees
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.16em] text-muted">Margin (before fees)</div>
          <div className={cn('text-[22px] font-semibold leading-[1.15]', marginToneClass(summary.marginPct))}>
            +{formatIsk(summary.margin)}
            <span className="text-[14px] ml-2">({formatPct(summary.marginPct)})</span>
          </div>
        </div>
        <div className="flex gap-5 flex-wrap">
          <Stat label="Input cost" value={formatIsk(summary.inputCost)} />
          <Stat label="Sell (Jita)" value={formatIsk(summary.revenue)} />
        </div>
      </div>

      {/* Build plan — the hybrid, drawn natively on the page (no viewport box). */}
      <div className="flex items-baseline gap-2.5 mb-3">
        <span className="font-display font-semibold text-[13px] tracking-[0.08em] uppercase text-name">
          Build Plan
        </span>
        <span className="text-[10px] text-muted">consolidated tiers · click a part for its flow</span>
      </div>
      <FlowConnectors key={bp.id} structure={structure} />
    </div>
  );
}
