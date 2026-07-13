// The build-plan node card's shell derivation (extracted from NodeCard so the
// interactivity + class-state decisions are unit-tested and the component stays
// a render shell): whether the card drills (has an onSelect), the icon rendition
// to show, the a11y props for an interactive card, and the tone/state classes.

import { cn } from '@/components/ui/cn';
import type { TypeIconVariant } from '@/components/type-icon';

// A `min-h` floor keeps every card the same height whatever its name length; the
// icon + ring centre on the same line — the uniformity the layout is for.
const CARD =
  'flex min-h-[72px] items-center gap-2.5 border-t border-border-soft first:border-t-0 px-3 py-2.5 text-left transition-opacity';

export interface NodeCardView {
  interactive: boolean;
  iconDesc: { typeId: number; variant: TypeIconVariant };
  role: 'button' | undefined;
  tabIndex: 0 | undefined;
  ariaPressed: boolean | undefined;
  className: string;
}

export function nodeCardView(args: {
  onSelect?: () => void;
  // The rendition the icon should show; absent → the item's own `icon` (the
  // default that keeps every non-planner consumer byte-identical to today).
  icon?: { typeId: number; variant: TypeIconVariant };
  typeId: number;
  selected: boolean;
  related: boolean;
  faded: boolean;
}): NodeCardView {
  const interactive = args.onSelect !== undefined;
  return {
    interactive,
    iconDesc: args.icon ?? { typeId: args.typeId, variant: 'icon' },
    role: interactive ? 'button' : undefined,
    tabIndex: interactive ? 0 : undefined,
    ariaPressed: interactive ? args.selected : undefined,
    className: cn(
      CARD,
      args.faded && 'opacity-25',
      args.related && 'bg-row-related',
      args.selected && 'bg-isk-selected shadow-selected-rail',
      interactive && 'cursor-pointer hover:bg-row-hover',
    ),
  };
}
