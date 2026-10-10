'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { cva } from 'class-variance-authority';
import Link from 'next/link';
import { useRef } from 'react';
import { cn } from './cn';
import { useSlidingThumb } from './use-sliding-thumb';

const segment = cva(
  'rounded-full border border-transparent font-ui ' +
    'transition-[color,background-color,border-color,box-shadow] duration-fast disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted',
  {
    variants: {
      active: {
        true: 'border-border-active bg-row-on text-isk shadow-card-edge',
        false: 'text-muted hover:text-text',
      },
      density: {
        default: 'px-3 py-1 text-nav',
        compact: 'px-2 py-0.5 text-label',
      },
    },
    defaultVariants: { active: false, density: 'default' },
  },
);

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
  href?: string;
}

const track = cva(
  'inline-flex rounded-full border border-border bg-bg-deep/60 shadow-field-inset',
  {
    variants: {
      density: {
        default: 'gap-0.5 p-[3px]',
        compact: 'gap-0 overflow-hidden p-0',
      },
    },
    defaultVariants: { density: 'default' },
  },
);

/**
 * The pressed segment's fill, drawn once under the track so it can slide
 * between segments. Once it is placed, the segments themselves go clear.
 */
const thumb =
  'pointer-events-none absolute left-[var(--thumb-left)] top-[var(--thumb-top)] h-[var(--thumb-height)] w-[var(--thumb-width)] rounded-full border border-border-active bg-row-on opacity-0 shadow-card-edge duration-lift ease-out-expo group-data-[thumb]/segmented:opacity-100 group-data-[thumb]/segmented:transition-[left,width] motion-reduce:transition-none';
const clearOnThumb =
  'relative z-10 group-data-[thumb]/segmented:border-transparent group-data-[thumb]/segmented:bg-transparent group-data-[thumb]/segmented:shadow-none';

export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  density = 'default',
  className,
}: {
  options: readonly SegmentedOption[];
  value: string;
  onChange?: (value: string) => void;
  label: string;
  density?: 'default' | 'compact';
  className?: string;
}) {
  const linkMode = options.some((option) => option.href !== undefined);
  if (linkMode) {
    return (
      <div role="group" aria-label={label} className={cn(track({ density }), className)}>
        {options.map((option) => (
          <SegmentLink key={option.value} option={option} active={value === option.value} density={density} />
        ))}
      </div>
    );
  }

  return <ToggleSegments options={options} value={value} onChange={onChange} label={label} density={density} className={className} />;
}

/**
 * One link-mode segment: a soft navigation that keeps the scroll position,
 * since the choice changes in place. An option with no href, or a disabled
 * one, stays in the row as an unavailable link that goes nowhere.
 */
function SegmentLink({
  option,
  active,
  density,
}: {
  option: SegmentedOption;
  active: boolean;
  density: 'default' | 'compact';
}) {
  if (option.href === undefined || option.disabled) {
    return (
      <a role="link" aria-disabled className={cn(segment({ density }), 'cursor-not-allowed opacity-40 hover:text-muted')}>
        {option.label}
      </a>
    );
  }
  return (
    <Link
      href={option.href}
      scroll={false}
      aria-current={active ? 'page' : undefined}
      className={segment({ active, density })}
    >
      {option.label}
    </Link>
  );
}

function ToggleSegments({
  options,
  value,
  onChange,
  label,
  density,
  className,
}: {
  options: readonly SegmentedOption[];
  value: string;
  onChange?: (value: string) => void;
  label: string;
  density: 'default' | 'compact';
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  useSlidingThumb(trackRef, thumbRef, value);
  return (
    <ToggleGroup
      ref={trackRef}
      value={[value]}
      onValueChange={(next) => {
        const selected = next[0];
        if (selected !== undefined) onChange?.(selected);
      }}
      aria-label={label}
      className={cn(track({ density }), 'group/segmented relative isolate', className)}
    >
      <span ref={thumbRef} aria-hidden className={thumb} />
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(segment({ active: value === option.value, density }), clearOnThumb)}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
