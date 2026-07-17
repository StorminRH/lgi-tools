'use client';

import { Radio } from '@base-ui/react/radio';
import { RadioGroup as BaseGroup } from '@base-ui/react/radio-group';
import { cn } from './cn';

/**
 * One caller-supplied radio option; its value is the stable control key and its label or marker is
 * presentation-ready.
 */
export interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Renders the domain-neutral radio group with house behavior and tokens; callers own semantic
 * meaning and content while this primitive owns presentation.
 */
export function RadioGroup({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  disabled,
  className,
}: {
  label: string;
  options: readonly RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <BaseGroup
      aria-label={label}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next)}
      name={name}
      disabled={disabled}
      className={cn('flex flex-col gap-2.5', className)}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-start gap-2.5 font-mono text-ui text-text has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50"
        >
          <Radio.Root
            value={option.value}
            disabled={option.disabled}
            className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border-idle bg-bg-deep shadow-field-inset outline-none focus-visible:border-border-active focus-visible:ring-1 focus-visible:ring-isk-sub data-[checked]:border-isk"
          >
            <Radio.Indicator className="h-2 w-2 rounded-full bg-isk" />
          </Radio.Root>
          <span className="flex flex-col gap-0.5">
            <span>{option.label}</span>
            {option.description ? (
              <span className="text-label text-faint">{option.description}</span>
            ) : null}
          </span>
        </label>
      ))}
    </BaseGroup>
  );
}
