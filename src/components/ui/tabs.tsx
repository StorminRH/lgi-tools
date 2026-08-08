'use client';

import { Tabs as Base } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * One caller-supplied tab option; its value is the stable control key and its label or marker is
 * presentation-ready.
 */
export interface TabOption {
  value: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

/**
 * Renders the domain-neutral tabs with house behavior and tokens; callers own semantic meaning and
 * content while this primitive owns presentation.
 */
export function Tabs({
  tabs,
  label,
  value,
  defaultValue,
  onValueChange,
  className,
  listClassName,
  tabClassName,
  panelClassName,
}: {
  tabs: readonly TabOption[];
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  listClassName?: string;
  tabClassName?: string;
  panelClassName?: string;
}) {
  return (
    <Base.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(String(next))}
      className={className}
    >
      <Base.List
        aria-label={label}
        className={cn(
          'relative flex gap-0.5 border-b border-border',
          listClassName,
        )}
      >
        {tabs.map((tab) => (
          <Base.Tab
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className={cn(
              'relative px-3.5 py-2 font-ui text-nav text-muted outline-none hover:text-text focus-visible:text-name focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-isk-sub data-[active]:text-name disabled:opacity-40',
              tabClassName,
            )}
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
          className={cn(
            'px-0.5 py-3.5 font-ui text-ui text-text outline-none',
            panelClassName,
          )}
        >
          {tab.content}
        </Base.Panel>
      ))}
    </Base.Root>
  );
}
