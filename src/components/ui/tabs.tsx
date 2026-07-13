'use client';

import { Tabs as Base } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface TabOption {
  value: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

export function Tabs({
  tabs,
  label,
  value,
  defaultValue,
  onValueChange,
  className,
}: {
  tabs: readonly TabOption[];
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <Base.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(String(next))}
      className={className}
    >
      <Base.List aria-label={label} className="relative flex gap-0.5 border-b border-border">
        {tabs.map((tab) => (
          <Base.Tab
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className="relative px-3.5 py-2 font-mono text-ui tracking-copy uppercase text-muted outline-none hover:text-text focus-visible:text-name focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-isk-sub data-[active]:text-name disabled:opacity-40"
          >
            {tab.label}
          </Base.Tab>
        ))}
        <Base.Indicator className="absolute -bottom-px left-0 h-0.5 w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)] bg-isk transition-[width,translate] duration-fast motion-reduce:transition-none" />
      </Base.List>
      {tabs.map((tab) => (
        <Base.Panel
          key={tab.value}
          value={tab.value}
          className={cn('px-0.5 py-3.5 font-mono text-ui text-text outline-none')}
        >
          {tab.content}
        </Base.Panel>
      ))}
    </Base.Root>
  );
}
