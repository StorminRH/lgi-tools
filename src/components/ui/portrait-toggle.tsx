'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { ReactNode } from 'react';

/** Round portrait chrome shared by menu checkbox items (data-checked) and form toggles (data-pressed). */
export const portraitToggleClass =
  'box-border flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent p-0.5 leading-none opacity-35 grayscale outline-none transition-[border-color,opacity,filter] data-[checked]:border-isk data-[checked]:opacity-100 data-[checked]:grayscale-0 data-[pressed]:border-isk data-[pressed]:opacity-100 data-[pressed]:grayscale-0 data-[highlighted]:ring-1 data-[highlighted]:ring-isk-sub focus-visible:ring-1 focus-visible:ring-isk-sub disabled:cursor-not-allowed motion-reduce:transition-none data-[tracking-reconnect]:border-tone-orange data-[checked]:data-[tracking-reconnect]:border-tone-orange';

export const portraitToggleRowClass = 'flex flex-wrap items-center gap-2';

export function PortraitToggleGroup({
  value,
  onValueChange,
  label,
  disabled,
  children,
}: {
  value: readonly string[];
  onValueChange: (value: string[]) => void;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <ToggleGroup
      multiple
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      aria-label={label}
      className={portraitToggleRowClass}
    >
      {children}
    </ToggleGroup>
  );
}

export function PortraitToggle({
  value,
  label,
  children,
}: {
  value: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Toggle value={value} aria-label={label} title={label} className={portraitToggleClass}>
      {children}
    </Toggle>
  );
}
