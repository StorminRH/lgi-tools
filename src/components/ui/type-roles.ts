import { cva } from 'class-variance-authority';

/**
 * The uppercase tracked label. The defaults are the interface eyebrow: font-ui,
 * medium weight, tracking-wide. The `inherit` font and weight values emit no
 * class, so a label set in its parent's face or weight keeps it. Override a
 * class through cn(eyebrow(), extra): cva appends `className` without merging.
 */
export const eyebrow = cva('uppercase', {
  variants: {
    font: {
      ui: 'font-ui',
      data: 'font-data',
      inherit: '',
    },
    size: {
      micro: 'text-micro',
      label: 'text-label',
    },
    tone: {
      muted: 'text-muted',
      faint: 'text-faint',
      isk: 'text-isk',
      callout: 'text-callout-label',
      inherit: '',
    },
    weight: {
      inherit: '',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
    emphasis: {
      label: 'tracking-label',
      normal: 'tracking-wide',
      strong: 'tracking-eyebrow',
    },
  },
  defaultVariants: {
    font: 'ui',
    size: 'label',
    tone: 'muted',
    weight: 'medium',
    emphasis: 'normal',
  },
});

/** The data label: an eyebrow in the data face at label tracking, in its parent's weight. */
export function dataLabel(options?: Parameters<typeof eyebrow>[0]): string {
  return eyebrow({ font: 'data', weight: 'inherit', emphasis: 'label', ...options });
}

/**
 * The page title: display face, bold, tracked and uppercase. Called bare (as
 * SectionHead does) it sets solid. Through cn() (as PageTitle does) the later
 * text size drops `leading-none`, so the size token's own line height applies.
 */
export const pageTitle = cva(
  'font-display font-bold leading-none tracking-optical uppercase text-name',
  {
    variants: {
      size: {
        hero: 'text-display',
        page: 'text-title',
        compact: 'text-h2',
      },
    },
    defaultVariants: { size: 'page' },
  },
);

/** The display-face title of a dialog or card: semibold, tracked and uppercase. */
export const displayTitle = cva('font-display font-semibold tracking-copy uppercase', {
  variants: {
    size: {
      h2: 'text-h2',
      h3: 'text-h3',
      nav: 'text-nav',
    },
    tone: {
      name: 'text-name',
      danger: 'text-pill-red-text',
    },
    wrap: {
      true: 'min-w-0 break-words',
      false: '',
    },
  },
  defaultVariants: {
    size: 'h2',
    tone: 'name',
    wrap: false,
  },
});
