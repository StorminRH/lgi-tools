'use client';

import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  InboxIcon,
  InfoIcon,
  SearchIcon,
} from '@/components/ui/icons';
import { Kbd } from '@/components/ui/kbd';
import { ReferenceGroup, Specimen, Variant } from './specimen';

const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const;

const ICONS = [
  { name: 'Search', Icon: SearchIcon },
  { name: 'Copy', Icon: CopyIcon },
  { name: 'Check', Icon: CheckIcon },
  { name: 'Chevron', Icon: ChevronDownIcon },
  { name: 'Close', Icon: CloseIcon },
  { name: 'Info', Icon: InfoIcon },
  { name: 'Alert', Icon: AlertIcon },
  { name: 'Inbox', Icon: InboxIcon },
] as const;

export function ActionsGroup() {
  return (
    <ReferenceGroup
      id="actions"
      title="Actions"
      intro="Pressable controls and the small affordances that sit beside them."
    >
      <Specimen
        name="Button"
        source="button"
        note="Four styled variants in two sizes, plus a bare variant that keeps only the focus and disabled states for custom triggers."
        wide
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {BUTTON_VARIANTS.map((variant) => (
            <Variant key={variant} label={variant}>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant={variant}>Save plan</Button>
                <Button variant={variant} size="sm">Small</Button>
                <Button variant={variant} size="sm" disabled>Disabled</Button>
              </div>
            </Variant>
          ))}
        </div>
        <div className="mt-5">
          <Variant label="bare">
            <Button variant="bare" className="w-fit border-b border-dotted border-border-active text-ui text-text">
              Bare trigger
            </Button>
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="CopyButton"
        source="copy-button"
        note="A selectable value well with a copy action that confirms success and falls back to manual selection when the clipboard is unavailable."
      >
        <div className="flex flex-wrap items-center gap-3">
          <CopyButton value="312,400,000 ISK" />
          <CopyButton value="J115405" label="Copy system" feedbackLabel="System name" />
          <CopyButton value="disabled" displayValue="Read-only value" disabled />
        </div>
      </Specimen>

      <Specimen
        name="Kbd"
        source="kbd"
        note="Semantic keycaps for shortcut hints in copy and menus."
      >
        <p className="font-ui text-ui text-muted">
          Focus search <Kbd>⌘</Kbd> <Kbd>K</Kbd> · close <Kbd>esc</Kbd> · next result <Kbd>↓</Kbd>
        </p>
      </Specimen>
      <Specimen
        name="Icons"
        source="icons"
        note="The rounded 24px stroke set the primitives draw with: the field and search prompts, copy feedback, dropdown chevrons, banners, and empty states."
      >
        <div className="flex flex-wrap gap-4 text-muted">
          {ICONS.map(({ name, Icon }) => (
            <Variant key={name} label={name}>
              <Icon size={20} />
            </Variant>
          ))}
        </div>
      </Specimen>
    </ReferenceGroup>
  );
}
