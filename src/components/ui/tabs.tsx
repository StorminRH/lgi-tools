'use client';

import { Tabs as Base } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface TabOption {
  value: string;
  label: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
}

/**
 * The tab bar's look, shared with tab bars that navigate between routes: an
 * inset glass track, the tabs as pills on it, and a green-lit spotlight behind
 * the selected one.
 */
export const tabTrack =
  'relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-bg-deep/60 p-1 shadow-field-inset';
export const tabItem =
  'relative z-10 shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 font-ui text-nav text-muted outline-none transition-colors duration-panel hover:text-text focus-visible:text-name focus-visible:ring-1 focus-visible:ring-isk-sub';
export const tabSpotlight = 'rounded-full border border-isk/30 bg-isk/[0.08] shadow-card-edge';

export function Tabs({
  tabs,
  label,
  value,
  defaultValue,
  onValueChange,
  className,
  listClassName,
  panelClassName,
  keepMounted = false,
}: {
  tabs: readonly TabOption[];
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
  keepMounted?: boolean;
}) {
  return (
    <Base.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(String(next))}
      className={className}
    >
      <Base.List aria-label={label} className={cn(tabTrack, listClassName)}>
        {tabs.map((tab) => (
          <Base.Tab
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className={cn(tabItem, 'data-[active]:text-isk data-[disabled]:opacity-40')}
          >
            {tab.label}
          </Base.Tab>
        ))}
        {/* The spotlight slides to the selected tab. */}
        <Base.Indicator
          className={cn(
            tabSpotlight,
            'absolute left-[var(--active-tab-left)] top-[var(--active-tab-top)] h-[var(--active-tab-height)] w-[var(--active-tab-width)] transition-[left,width] duration-lift ease-out-expo motion-reduce:transition-none',
          )}
        />
      </Base.List>
      {tabs.filter((tab) => tab.content !== undefined).map((tab) => (
        <Base.Panel
          key={tab.value}
          value={tab.value}
          keepMounted={keepMounted}
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
