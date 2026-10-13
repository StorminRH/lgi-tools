import { cva } from 'class-variance-authority';

const LABEL_TONES = {
  muted: 'text-muted',
  faint: 'text-faint',
  isk: 'text-isk',
  callout: 'text-callout-label',
  inherit: '',
} as const;

/**
 * The interface label, written in sentence case. The defaults are font-ui,
 * medium weight and optical tracking. The `inherit` font and weight values
 * emit no class, so a label set in its parent's face or weight keeps it.
 * Override a class through cn(eyebrow(), extra): cva appends `className`
 * without merging.
 */
export const eyebrow = cva('tracking-optical', {
  variants: {
    font: {
      ui: 'font-ui',
      inherit: '',
    },
    size: {
      micro: 'text-caption',
      label: 'text-eyebrow',
    },
    tone: LABEL_TONES,
    weight: {
      inherit: '',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
  },
  defaultVariants: {
    font: 'ui',
    size: 'label',
    tone: 'muted',
    weight: 'medium',
  },
});

/** The data label: the data face at normal tracking, in its parent's weight. */
export const dataLabel = cva('font-data tracking-normal', {
  variants: {
    size: {
      micro: 'text-caption',
      label: 'text-small',
    },
    tone: LABEL_TONES,
  },
  defaultVariants: {
    size: 'label',
    tone: 'muted',
  },
});

/**
 * The page title: display face, bold, at optical tracking. Called bare (as
 * SectionHead does) it sets solid. Through cn() (as PageTitle does) the later
 * text size drops `leading-none`, so the size token's own line height applies.
 */
export const pageTitle = cva(
  'font-display font-bold leading-none tracking-optical text-name',
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

/** The display-face title of a dialog or card: semibold, at optical tracking. */
export const displayTitle = cva('font-display font-semibold tracking-optical', {
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
