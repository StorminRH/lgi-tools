import { eyebrow } from './type-roles';

export const panelSurface = 'border border-border-idle glass-panel shadow-dd';

export const panelSurfaceSolid = 'border border-border-idle bg-bg-deep shadow-dd';

export const dropdownPanel = `${panelSurface} rounded-card p-[5px] outline-none`;

export const dropdownItem =
  'flex cursor-default select-none items-center justify-between gap-2 rounded-ctl px-2.5 py-2 ' +
  'text-ui font-data text-text outline-none ' +
  'data-[highlighted]:bg-row-active data-[highlighted]:text-name ' +
  'data-[selected]:bg-pill-green-bg data-[selected]:text-isk';

export const dropdownGroupLabel =
  `px-2.5 pt-2 pb-1 ${eyebrow({ tone: 'faint', emphasis: 'strong' })}`;

export const menuRow =
  'flex w-full cursor-pointer items-center gap-2 px-3 py-2 font-ui text-nav text-muted outline-none ' +
  'data-[highlighted]:bg-row-active data-[highlighted]:text-name';

export const menuSeparator = 'h-px bg-border-soft';

export const menuSection = 'flex flex-col border-t border-border-soft pb-1';

export const menuSectionLabel = `px-3 pb-1 pt-2 ${eyebrow({
  size: 'micro',
  tone: 'faint',
})}`;

export const menuControlRow = `${menuRow} justify-between`;
