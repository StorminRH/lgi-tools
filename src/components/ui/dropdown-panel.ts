import { eyebrow } from './type-roles';

export const panelSurface = 'border border-border-idle glass-dense glass-lit shadow-dd';

export const menuPanelSurface = `${panelSurface} rounded-card overflow-hidden`;

/** Scale-and-fade in from the positioner's anchor edge, for Popover and Tooltip popups. */
export const popIn =
  'origin-[var(--transform-origin)] transition-[opacity,transform] duration-fast motion-reduce:transition-none ' +
  'data-[starting-style]:scale-95 data-[starting-style]:opacity-0 ' +
  'data-[ending-style]:scale-95 data-[ending-style]:opacity-0';

export const dropdownPanel = `${panelSurface} dropdown-panel-in rounded-card p-1.5 outline-none`;

export const dropdownOption = 'dropdown-option cursor-default select-none outline-none';

export const dropdownItem =
  `${dropdownOption} flex items-center justify-between gap-2.5 font-ui text-nav text-text`;

export const dropdownGroupLabel = 'px-2.5 pt-2.5 pb-1 font-ui text-label font-medium text-faint';

export const menuRow =
  'flex w-full cursor-pointer items-center gap-2 px-3 py-2 font-ui text-nav text-muted outline-none ' +
  'transition-colors data-[highlighted]:bg-row-on data-[highlighted]:text-name';

export const menuSeparator = 'h-px bg-border-soft';

export const menuSection = 'flex flex-col border-t border-border-soft pb-1';

export const menuSectionLabel = `px-3 pb-1 pt-2 ${eyebrow({
  size: 'micro',
  tone: 'faint',
})}`;

export const menuControlRow = `${menuRow} justify-between`;
