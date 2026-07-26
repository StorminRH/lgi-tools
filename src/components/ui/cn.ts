import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

export type { ClassValue };

// The named type-scale and semantic font-role tokens in globals.css. tailwind-merge
// ships knowing only the default `text-xs…9xl` sizes, so without registering
// these it misclassifies `text-ui`/`text-label`/… as text-COLOR utilities — and
// when a size token and a tone color meet in one cn() call it drops one, so a
// pill silently loses its color (or its size). The font, spacing, container and
// tracking theme extensions likewise teach every consuming class group about
// the house values instead of enumerating each utility form. Keep these scales
// in sync with globals.css.
//
// The named radius/shadow tokens (--radius-* / --shadow-*, 3.8.2.2) need the same
// treatment: the shadow tokens misfile into the `shadow-COLOR` group by default,
// so `shadow-btn-bezel` is silently dropped when a `shadow-<color>` meets it in a
// cn() call, and `shadow-none` can't override them. Registering under the real
// `shadow`/`rounded` groups keeps box-shadow and radius overriding correctly.
// Keep both lists in sync with the `--radius-*`/`--shadow-*` tokens in globals.css.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      font: ['ui', 'data', 'display'],
      spacing: [
        'icon-xs',
        'icon-sm',
        'icon-md',
        'icon-lg',
        'cluster',
        'section',
        'region',
        'page',
      ],
      container: ['reading', 'frame'],
    },
    classGroups: {
      'font-size': [
        {
          text: [
            'micro',
            'label',
            'ui',
            'nav',
            'body',
            'lead',
            'h3',
            'stat',
            'h2',
            'title',
            'display',
            'hero',
          ],
        },
      ],
      tracking: [
        {
          tracking: ['optical', 'copy', 'label', 'wide', 'eyebrow'],
        },
      ],
      rounded: [{ rounded: ['ctl', 'card'] }],
      shadow: [
        {
          shadow: [
            'field-inset',
            'field-focus',
            'btn-bezel',
            'card-edge',
            'dd',
            'card-hover',
            'popover-green',
            'toast',
            'status-info',
            'status-warn',
            'dot-orange',
            'dot-blue',
            'selected-rail',
          ],
        },
      ],
    },
  },
});

/**
 * Joins class names AND resolves Tailwind conflicts: when a consumer's
 * `className` overlaps a primitive's own utilities (same property group),
 * twMerge keeps the last one so the override actually wins instead of both
 * shipping and the cascade deciding. clsx handles the conditional/falsy forms.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
