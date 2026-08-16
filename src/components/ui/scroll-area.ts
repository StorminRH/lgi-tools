/**
 * Shared native-scrollbar affordance for bounded scroll regions.
 *
 * Apply alongside the owning overflow utility. The stylesheet keeps the track visible before
 * interaction and gives the thumb enough contrast to reveal additional content without replacing
 * native scrolling behavior.
 */
export const scrollArea = 'scroll-area';

/**
 * Same painted rail, scrollbar on the inline-start edge. Use when the
 * region sits on the left of the page so the thumb does not cover content.
 */
export const scrollAreaStart = `${scrollArea} scroll-area-start`;
