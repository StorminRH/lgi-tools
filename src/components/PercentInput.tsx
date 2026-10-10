'use client';

import { cn } from '@/components/ui/cn';
import type { FieldControlProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/**
 * A percentage text field. Name it with `ariaLabel`, or wrap it in a Field,
 * which hands the input its `id`, `aria-describedby` and `aria-invalid`.
 */
export function PercentInput({
  value,
  onChange,
  ariaLabel,
  className,
  ...fieldWiring
}: FieldControlProps & {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <Input
      size="sm"
      inputMode="decimal"
      {...fieldWiring}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={cn('w-full', className)}
      trailing={<span className="pr-1 font-data text-micro text-faint">%</span>}
    />
  );
}
