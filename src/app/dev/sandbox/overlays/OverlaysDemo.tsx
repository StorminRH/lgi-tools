'use client';

import { Tooltip } from '@base-ui/react/tooltip';
import { Popover } from '@base-ui/react/popover';
import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { VariantFrame } from '../_shared/sandbox-ui';

// OOB.2.1 proving harness — each overlay is composed the way Base UI intends
// (Root › Trigger + Portal › Positioner › Popup), styled only via `className`
// (Tailwind + the EVE tone tokens). We never pass a `style` attribute: Base UI's
// Positioner writes its own placement style internally (Floating UI). The runtime
// inline style it injects is permitted by the post-OOB.1.1 CSP. See README.md.

// Shared tone-token class strings. Defined once here so each overlay reads as the
// same surface — not a primitive, just local sandbox constants.
const TRIGGER =
  'inline-flex items-center justify-center gap-1 font-mono text-[11px] uppercase ' +
  'tracking-[0.12em] text-isk border border-border-active bg-surface-raised px-3 py-1.5 ' +
  'rounded-[3px] cursor-pointer transition-colors hover:bg-row-hover ' +
  'data-[popup-open]:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-1 ' +
  'focus-visible:outline-isk';

// Popups share one surface treatment. `origin-[var(--transform-origin)]` reads the
// custom property Base UI sets on the popup; the data-attribute variants drive the
// enter/exit transition (the recommended Base UI animation idiom, no keyframes).
const POPUP =
  'rounded-[4px] border border-border-active bg-tooltip text-text text-[12px] leading-[1.5] ' +
  'shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] origin-[var(--transform-origin)] ' +
  'transition-[opacity,transform] duration-150 data-[starting-style]:opacity-0 ' +
  'data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95';

function TooltipDemo() {
  return (
    <Tooltip.Provider delay={150}>
      <Tooltip.Root>
        <Tooltip.Trigger className={TRIGGER}>Hover me</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={8} className="z-50">
            <Tooltip.Popup className={`${POPUP} px-2.5 py-1.5`}>
              Hover/focus-driven. The Provider shares one open-delay.
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function PopoverDemo() {
  return (
    <Popover.Root>
      <Popover.Trigger className={TRIGGER}>Open popover</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} className="z-50">
          <Popover.Popup className={`${POPUP} w-[240px] p-3.5 outline-none`}>
            <Popover.Title className="font-display text-[13px] text-name mb-1">
              Popover title
            </Popover.Title>
            <Popover.Description className="text-muted text-[11px]">
              Click-driven. Dismisses on Esc or outside click; focus moves into the
              popup and restores to the trigger on close.
            </Popover.Description>
            <Popover.Close className={`${TRIGGER} mt-3`}>Close</Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function DialogDemo() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className={TRIGGER}>Open dialog</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/60 transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup
          className={`${POPUP} fixed left-1/2 top-1/2 w-[320px] -translate-x-1/2 -translate-y-1/2 p-5 outline-none`}
        >
          <Dialog.Title className="font-display text-[14px] text-name mb-1.5">
            Dialog title
          </Dialog.Title>
          <Dialog.Description className="text-muted text-[11px] mb-4">
            Modal — focus-trapped, scroll-locked, Esc-to-close; backdrop click closes.
            Centered with translate utilities (no Positioner — a dialog isn’t anchored).
          </Dialog.Description>
          <div className="flex justify-end">
            <Dialog.Close className={TRIGGER}>Done</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const MENU_ITEM =
  'flex cursor-default select-none items-center px-3 py-1.5 text-[12px] text-text ' +
  'rounded-[2px] outline-none data-[highlighted]:bg-row-hover data-[highlighted]:text-isk';

function MenuDemo() {
  return (
    <Menu.Root>
      <Menu.Trigger className={TRIGGER}>Open menu ▾</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} className="z-50">
          <Menu.Popup className={`${POPUP} min-w-[180px] p-1 outline-none`}>
            <Menu.Group>
              <Menu.GroupLabel className="px-3 py-1 text-[9px] uppercase tracking-[0.14em] text-muted">
                Actions
              </Menu.GroupLabel>
              <Menu.Item className={MENU_ITEM}>Refresh prices</Menu.Item>
              <Menu.Item className={MENU_ITEM}>Copy fit</Menu.Item>
            </Menu.Group>
            <Menu.Separator className="my-1 h-px bg-border-soft" />
            <Menu.Item className={MENU_ITEM}>Settings</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function OverlaysDemo() {
  return (
    <>
      <VariantFrame
        tag="Overlay 1"
        title="Tooltip"
        notes="Provider › Root › Trigger + Portal › Positioner › Popup. Hover/focus driven."
      >
        <div className="flex items-center justify-center py-6">
          <TooltipDemo />
        </div>
      </VariantFrame>
      <VariantFrame
        tag="Overlay 2"
        title="Popover"
        notes="Root › Trigger + Portal › Positioner › Popup (Title/Description/Close). Click driven; Esc + outside-click dismiss."
      >
        <div className="flex items-center justify-center py-6">
          <PopoverDemo />
        </div>
      </VariantFrame>
      <VariantFrame
        tag="Overlay 3"
        title="Dialog"
        notes="Root › Trigger + Portal › Backdrop + Popup. Modal: focus-trapped, scroll-locked, no Positioner."
      >
        <div className="flex items-center justify-center py-6">
          <DialogDemo />
        </div>
      </VariantFrame>
      <VariantFrame
        tag="Overlay 4"
        title="Menu"
        notes="Root › Trigger + Portal › Positioner › Popup › Item/Group/Separator. Arrow-key navigation + typeahead."
      >
        <div className="flex items-center justify-center py-6">
          <MenuDemo />
        </div>
      </VariantFrame>
    </>
  );
}
