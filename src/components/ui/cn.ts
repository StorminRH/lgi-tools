import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

export type { ClassValue };

// The named type-scale tokens (globals.css `@theme` --text-*). tailwind-merge
// ships knowing only the default `text-xs…9xl` sizes, so without registering
// these it misclassifies `text-ui`/`text-label`/… as text-COLOR utilities — and
// when a size token and a tone color meet in one cn() call it drops one, so a
// pill silently loses its color (or its size). Registering them in the font-size
// group keeps size and color as separate, both-surviving groups. Keep this list
// in sync with the `--text-*` scale in globals.css.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'micro',
            'label',
            'ui',
            'body',
            'lead',
            'h3',
            'stat',
            'h2',
            'display',
            'hero',
          ],
        },
      ],
    },
  },
});

// Joins class names AND resolves Tailwind conflicts: when a consumer's
// `className` overlaps a primitive's own utilities (same property group),
// twMerge keeps the last one so the override actually wins instead of both
// shipping and the cascade deciding. clsx handles the conditional/falsy forms.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
