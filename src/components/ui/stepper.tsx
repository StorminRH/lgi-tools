'use client';

import { NumberField } from '@base-ui/react/number-field';
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  ariaLabel,
  variant = 'default',
  trailing,
  reserveTrailing = false,
  className,
  valueClassName,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel: string;
  variant?: 'default' | 'inline';
  trailing?: ReactNode;
  reserveTrailing?: boolean;
  className?: string;
  valueClassName?: string;
}) {
  const inline = variant === 'inline';
  const disabledBtn =
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted';
  const btn = inline
    ? `relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-ctl text-micro leading-none text-muted hover:bg-isk-hover-strong hover:text-isk cursor-pointer after:absolute after:-inset-1 after:content-[''] ${disabledBtn}`
    : `h-7 w-[26px] text-ui leading-none text-muted hover:bg-isk-hover-strong hover:text-isk cursor-pointer ${disabledBtn}`;
  return (
    <NumberField.Root
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      onValueCommitted={(next) => onChange(next ?? min)}
      min={min}
      max={max}
      step={step}
      smallStep={step}
      largeStep={step * 10}
      format={{ maximumFractionDigits: 0 }}
      className={cn(
        'inline-flex items-center',
        (trailing != null || reserveTrailing) && 'gap-1',
        className,
      )}
    >
      {stepperField({ ariaLabel, btn, inline, valueClassName })}
      {(trailing != null || reserveTrailing) && (
        <span className="inline-flex w-3.5 shrink-0 items-center justify-center">
          {trailing}
        </span>
      )}
    </NumberField.Root>
  );
}

function stepperField({
  ariaLabel,
  btn,
  inline,
  valueClassName,
}: {
  ariaLabel: string;
  btn: string;
  inline: boolean;
  valueClassName?: string;
}) {
  return (
    <NumberField.Group
      className={cn(
        'inline-flex items-center',
        !inline && 'overflow-hidden rounded-ctl border border-border bg-bg',
      )}
    >
      <NumberField.Decrement aria-label={`Decrease ${ariaLabel}`} className={btn}>
        {inline ? '▼' : '–'}
      </NumberField.Decrement>
      <NumberField.Input
        aria-label={ariaLabel}
        className={cn(
          'bg-transparent text-center font-data text-ui text-name outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          inline
            ? 'w-[22px] tabular-nums'
            : 'h-7 w-12 border-x border-border-soft focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-isk-sub',
          valueClassName,
        )}
      />
      <NumberField.Increment aria-label={`Increase ${ariaLabel}`} className={btn}>
        {inline ? '▲' : '+'}
      </NumberField.Increment>
    </NumberField.Group>
  );
}
