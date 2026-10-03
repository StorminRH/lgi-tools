import { cn } from '@/components/ui/cn';
import { itemImage, type EveImageDescriptor } from '@/data/eve-data/type-images';

/**
 * Icon, name and quantity on one line while the tier's column has room; in a
 * narrow column the name takes its own full-width line under the icon and
 * quantity, so every tier can share the page and still read.
 */
const CARD = cn(
  'grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5',
  'border-t border-border-soft first:border-t-0 px-3 py-2.5 text-left',
  "[grid-template-areas:'icon_name_qty'] @max-[14rem]:[grid-template-areas:'icon_._qty'_'name_name_name'] @max-[14rem]:px-2.5",
);

/**
 * A buildable's chain, once the pointer settles on it, rises slightly over a
 * soft glow, easing in as slowly as a card lifts.
 */
const GLOW =
  "after:pointer-events-none after:absolute after:inset-1 after:rounded-card after:opacity-0 after:shadow-node-lift after:transition-opacity after:duration-lift after:ease-out-expo after:content-['']";

export interface NodeCardView {
  interactive: boolean;
  iconDesc: EveImageDescriptor;
  className: string;
}

export function nodeCardView(args: {
  onOpen?: () => void;
  icon?: EveImageDescriptor;
  typeId: number;
  lit: boolean;
  dimmed: boolean;
}): NodeCardView {
  const interactive = args.onOpen !== undefined;
  return {
    interactive,
    iconDesc: args.icon ?? itemImage(args.typeId),
    className: cn(
      CARD,
      GLOW,
      'relative transition-[opacity,background-color,translate] duration-lift ease-out-expo motion-reduce:transition-none',
      args.lit && 'after:opacity-100 motion-safe:-translate-y-0.5',
      args.dimmed && 'opacity-60',
      interactive && 'cursor-pointer hover:bg-row-hover',
    ),
  };
}
