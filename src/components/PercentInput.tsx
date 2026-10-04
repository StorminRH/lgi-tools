'use client';

import { cn } from '@/components/ui/cn';
import { Input } from '@/components/ui/input';

export function PercentInput({
  value,
  onChange,
  ariaLabel,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Input
      size="sm"
      inputMode="decimal"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={cn('w-full', className)}
      trailing={<span className="pr-1 font-data text-micro text-faint">%</span>}
    />
  );
}
