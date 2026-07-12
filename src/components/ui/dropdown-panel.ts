// The shared dropdown-panel treatment ("Inset Instrument", 3.8.2.3) — the ONE
// floating-panel surface every popup wears (the Select popup, the Menu, the
// Popover), so no two dropdowns drift and no OS-styled popup ever opens inside the
// dark UI. The panel reads as a recessed tray (bg-deep well + idle border + the
// engraved `dd` shadow); items are control-radius rows that light on highlight and
// go ISK-green when chosen; group labels are the faint uppercase micro-caps. Pure
// class strings composed at each primitive via `cn()`; every token is already
// minted in globals.css and registered in cn.ts (no new families here).

// The panel surface: a recessed tray. The 5px inset frames the item rows.
export const dropdownPanel =
  'rounded-card border border-border-idle bg-bg-deep p-[5px] shadow-dd outline-none';

// A selectable row. Base UI marks the pointer/keyboard-focused row `data-highlighted`
// and the chosen row `data-selected`; the row lights on the former and goes ISK-green
// on the latter.
export const dropdownItem =
  'flex cursor-default select-none items-center justify-between gap-2 rounded-ctl px-2.5 py-2 ' +
  'text-ui font-mono text-text outline-none ' +
  'data-[highlighted]:bg-row-active data-[highlighted]:text-name ' +
  'data-[selected]:bg-pill-green-bg data-[selected]:text-isk';

// A section heading above a group of rows.
export const dropdownGroupLabel =
  'px-2.5 pt-2 pb-1 text-label uppercase tracking-[0.14em] text-faint';
