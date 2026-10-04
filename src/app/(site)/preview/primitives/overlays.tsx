'use client';

import { useId, useRef, useState, type MouseEvent } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Drawer, DrawerClose } from '@/components/ui/drawer';
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuItem,
  MenuLinkItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  menuControlRow,
  menuRow,
  menuSeparator,
} from '@/components/ui/menu';
import { pointerAnchor } from '@/components/ui/overlay-positioning';
import { PointerMenu, type MenuAnchor } from '@/components/ui/pointer-menu';
import { Popover, PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { SidePanel } from '@/components/ui/side-panel';
import { ReferenceGroup, Specimen, Variant } from './specimen';

const secondaryTrigger = buttonVariants({ variant: 'secondary', size: 'sm' });

function SidePanelSample() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={trigger} variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Open side panel
      </Button>
      <SidePanel open={open} onOpenChange={setOpen} title="Structures" finalFocus={trigger}>
        <p className="text-ui text-muted">Manage structures while keeping the planner in view.</p>
      </SidePanel>
    </>
  );
}

function ReferenceMenu({ surface }: { surface: 'solid' | 'frosted' }) {
  const [sort, setSort] = useState('margin');
  const [showCleared, setShowCleared] = useState(true);
  return (
    <Menu
      label={`${surface} menu`}
      surface={surface}
      align="start"
      sideOffset={6}
      trigger={<>Plan options ▾</>}
      triggerClassName={secondaryTrigger}
      className="min-w-56"
    >
      <MenuGroup label="Sort by">
        <MenuRadioGroup value={sort} onValueChange={(value) => setSort(String(value))}>
          {['margin', 'volume', 'name'].map((option) => (
            <MenuRadioItem key={option} value={option} closeOnClick={false} className={menuRow}>
              {option}
              <MenuRadioItemIndicator className="ml-auto text-isk">✓</MenuRadioItemIndicator>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuGroup>
      <MenuGroup label="View">
        <MenuCheckboxItem
          checked={showCleared}
          onCheckedChange={setShowCleared}
          closeOnClick={false}
          className={menuControlRow}
        >
          Show cleared sites
          <span aria-hidden className="text-isk">{showCleared ? '✓' : ''}</span>
        </MenuCheckboxItem>
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuRow} onClick={() => setSort('margin')}>Reset sorting</MenuItem>
        <MenuLinkItem className={menuRow} href="#overlays">Back to overlays</MenuLinkItem>
      </MenuGroup>
    </Menu>
  );
}

function PointerMenuArea() {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const [picked, setPicked] = useState('nothing yet');
  const openAt = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setAnchor(pointerAnchor(event.clientX, event.clientY));
  };
  return (
    <>
      <div
        onContextMenu={openAt}
        className="flex h-24 items-center justify-center rounded-card border border-dashed border-border-active font-ui text-ui text-muted"
      >
        Right-click here · picked: {picked}
      </div>
      <PointerMenu
        open={anchor !== null}
        onOpenChange={(open) => {
          if (!open) setAnchor(null);
        }}
        anchor={anchor}
        label="Node actions"
        className="min-w-48 rounded-card p-1"
      >
        {['Add connection…', 'Rename system', 'Remove'].map((action) => (
          <MenuItem key={action} className={menuRow} onClick={() => setPicked(action)}>
            {action}
          </MenuItem>
        ))}
      </PointerMenu>
    </>
  );
}

function DialogSample() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <Button ref={trigger} size="sm" onClick={() => setOpen(true)}>Open dialog</Button>
      <Dialog open={open} onOpenChange={setOpen} labelledBy={titleId} finalFocus={trigger} className="w-[min(480px,calc(100vw-2rem))]">
        <DialogHeader titleId={titleId} title="Build location" description="Where this plan's jobs install." closeLabel="Close dialog" />
        <div className="flex flex-col gap-3 px-4 py-4 font-ui text-ui text-text">
          <p>DialogHeader composes DialogTitle, DialogDescription, and DialogClose for the common header.</p>
        </div>
        <footer className="flex justify-end gap-2.5 border-t border-border-soft px-4 py-3">
          <DialogClose render={<Button variant="secondary" size="sm" />}>Done</DialogClose>
        </footer>
      </Dialog>
    </>
  );
}

function BareDialogSample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Open bare parts</Button>
      <Dialog open={open} onOpenChange={setOpen} className="w-[min(420px,calc(100vw-2rem))] p-5">
        <DialogTitle className="font-ui text-h3 font-semibold text-name">Hand-composed</DialogTitle>
        <DialogDescription className="mt-2 font-ui text-ui text-muted">
          Use the parts directly when a dialog needs a custom header.
        </DialogDescription>
        <DialogClose render={<Button variant="secondary" size="sm" className="mt-4" />}>Close</DialogClose>
      </Dialog>
    </>
  );
}

const CONFIRM_SAMPLES = {
  danger: {
    trigger: 'danger',
    title: 'Unlink character',
    consequence:
      'This removes Lo-Hauler and its ESI tokens from your account. Industry jobs tracked under this character stop syncing.',
    confirm: 'Unlink',
  },
  neutral: {
    trigger: 'secondary',
    title: 'Archive plan',
    consequence: 'The plan moves to your archive. You can restore it later.',
    confirm: 'Archive',
  },
} as const;

function ConfirmSample({ tone }: { tone: keyof typeof CONFIRM_SAMPLES }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const sample = CONFIRM_SAMPLES[tone];
  return (
    <>
      <Button ref={trigger} variant={sample.trigger} size="sm" onClick={() => setOpen(true)}>
        {sample.title}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone={tone}
        title={sample.title}
        consequence={sample.consequence}
        busy={false}
        confirmLabel={sample.confirm}
        onConfirm={() => setOpen(false)}
        finalFocus={trigger}
        className="w-[min(440px,calc(100vw-2rem))]"
      />
    </>
  );
}

export function OverlaysGroup() {
  return (
    <ReferenceGroup
      id="overlays"
      title="Overlays"
      intro="Floating glass: hints, menus, dialogs, and the mobile drawer."
    >
      <Specimen
        name="Tooltip"
        source="tooltip"
        note="Supplemental hover and focus help. Base UI tooltips do not open on touch, so essential help uses Popover."
      >
        <Tooltip content="How fresh the Jita snapshot behind this value is. High means synced within the last hour.">
          <Button variant="bare" className="w-fit border-b border-dotted border-border-active text-ui text-text">
            Price confidence
          </Button>
        </Tooltip>
      </Specimen>

      <Specimen
        name="Popover"
        source="popover"
        note="Hover-or-tap panels for (?) help, with a heading and label/value rows. Neutral and green tones."
      >
        <div className="flex flex-wrap gap-3">
          <Popover label="Margin breakdown" trigger="Margin (?)" triggerClassName={secondaryTrigger}>
            <PopoverHeading>Margin breakdown</PopoverHeading>
            <PopoverRow label="Sell value">412.0M</PopoverRow>
            <PopoverRow label="Build cost" description="Materials at Jita sell plus job fees.">370.8M</PopoverRow>
            <PopoverRow label="Why it moved" layout="description">Tritanium rose 4% since yesterday.</PopoverRow>
          </Popover>
          <Popover label="Green popover" tone="green" trigger="Green tone" triggerClassName={secondaryTrigger}>
            <PopoverHeading>Synced</PopoverHeading>
            <PopoverRow label="Last update">2 min ago</PopoverRow>
          </Popover>
        </div>
      </Specimen>

      <Specimen
        name="Menu"
        source="menu"
        note="Action menus with labelled groups, radio and checkbox items, links, and separators. Solid by default; frosted over busy surfaces."
      >
        <div className="flex flex-wrap gap-6">
          <Variant label="solid">
            <ReferenceMenu surface="solid" />
          </Variant>
          <Variant label="frosted">
            <ReferenceMenu surface="frosted" />
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="PointerMenu"
        source="pointer-menu · overlay-positioning"
        note="A controlled menu anchored to a pointer position, for canvas context menus."
      >
        <PointerMenuArea />
      </Specimen>

      <Specimen
        name="Dialog"
        source="dialog"
        note="The modal glass sheet. DialogHeader is the standard header; the parts compose a custom one."
      >
        <div className="flex flex-wrap gap-3">
          <DialogSample />
          <BareDialogSample />
        </div>
      </Specimen>

      <Specimen
        name="ConfirmDialog"
        source="confirm-dialog"
        note="One confirmation shell with busy and error slots. Danger for destructive actions, neutral otherwise."
      >
        <div className="flex flex-wrap gap-3">
          <ConfirmSample tone="danger" />
          <ConfirmSample tone="neutral" />
        </div>
      </Specimen>

      <Specimen
        name="Drawer"
        source="drawer"
        note="A swipe-to-dismiss bottom sheet for mobile navigation and dense secondary content."
      >
        <Drawer title="Filters" trigger="Open drawer" triggerClassName={secondaryTrigger}>
          <div className="flex flex-col gap-3 font-ui text-ui text-text">
            <p>Drawers hold mobile navigation and secondary panels. Swipe down or close to dismiss.</p>
            <DrawerClose render={<Button variant="secondary" size="sm" className="self-start" />}>Close</DrawerClose>
          </div>
        </Drawer>
      </Specimen>
      <Specimen
        name="SidePanel"
        source="side-panel"
        note="A full-height right panel with a blurred backdrop, retained contents, and modal keyboard focus."
      >
        <SidePanelSample />
      </Specimen>
    </ReferenceGroup>
  );
}
