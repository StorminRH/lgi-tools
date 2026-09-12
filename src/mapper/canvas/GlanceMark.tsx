'use client';

import { cn } from '@/components/ui/cn';
import type { GlanceBucket } from '../signatures/signature-model';

function HarvestablesIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="size-icon-sm">
      <path d="M8 1.5 14 5v6L8 14.5 2 11V5L8 1.5Z" />
    </svg>
  );
}

function HackingIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="size-icon-sm">
      <path d="M8 1 15 8 8 15 1 8 8 1Z" />
    </svg>
  );
}

function CombatIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="size-icon-sm">
      <path d="M8 2 14 14H2L8 2Z" />
    </svg>
  );
}

function GlanceIcon({ bucket }: { readonly bucket: GlanceBucket }) {
  switch (bucket) {
    case 'harvestables':
      return <HarvestablesIcon />;
    case 'hacking':
      return <HackingIcon />;
    case 'combat':
      return <CombatIcon />;
    default: {
      const _never: never = bucket;
      return _never;
    }
  }
}

export function GlanceMark({ bucket }: { readonly bucket: GlanceBucket }) {
  return (
    <span
      data-glance-mark={bucket}
      className={cn('inline-flex size-icon-sm items-center justify-center text-isk')}
    >
      <GlanceIcon bucket={bucket} />
    </span>
  );
}
