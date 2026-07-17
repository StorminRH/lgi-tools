// The shared dropdown-panel treatment ("Inset Instrument", 3.8.2.3) — the ONE
// floating-panel surface every popup wears (the Select popup, the Menu, the
// Popover), so no two dropdowns drift and no OS-styled popup ever opens inside the
// dark UI. The panel reads as a recessed tray (bg-deep well + idle border + the
// engraved `dd` shadow); items are control-radius rows that light on highlight and
// go ISK-green when chosen; group labels are the faint uppercase micro-caps. Pure
// class strings composed at each primitive via `cn()`; every token is already
// minted in globals.css and registered in cn.ts (no new families here).

/**
 * The recessed-tray SURFACE every floating panel shares — the Select popup, the
 * Menu, the Popover. Split out from the full panel so a header-flush menu (square,
 * full-width rows) and a padded content popover can wear the same surface without
 * the card radius / 5px inset the Select dropdown adds.
 */
export const panelSurface = 'border border-border-idle bg-bg-deep shadow-dd';

/**
 * The full dropdown panel: the shared surface + card radius + a 5px inset that
 * frames the rounded item rows.
 */
export const dropdownPanel = `${panelSurface} rounded-card p-[5px] outline-none`;

/**
 * A selectable row. Base UI marks the pointer/keyboard-focused row `data-highlighted`
 * and the chosen row `data-selected`; the row lights on the former and goes ISK-green
 * on the latter.
 */
export const dropdownItem =
  'flex cursor-default select-none items-center justify-between gap-2 rounded-ctl px-2.5 py-2 ' +
  'text-ui font-mono text-text outline-none ' +
  'data-[highlighted]:bg-row-active data-[highlighted]:text-name ' +
  'data-[selected]:bg-pill-green-bg data-[selected]:text-isk';

/** A section heading above a group of rows. */
export const dropdownGroupLabel =
  'px-2.5 pt-2 pb-1 text-label uppercase tracking-emphasis text-faint';
