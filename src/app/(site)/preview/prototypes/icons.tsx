import type { ReactNode } from 'react';

/** Builds a 24px stroke icon that takes an optional size and className. */
function icon(paths: ReactNode) {
  return function StrokeIcon({ size = 16, className }: { size?: number; className?: string }) {
    return (
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        {paths}
      </svg>
    );
  };
}

export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="11" height="11" rx="3" />
    <path d="M5 15V7a3 3 0 0 1 3-3h7" />
  </>,
);
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const ChevronDownIcon = icon(<path d="M6 9l6 6 6-6" />);
export const ChevronRightIcon = icon(<path d="M9 6l6 6-6 6" />);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4-4" />
  </>,
);
export const CloseIcon = icon(<path d="M7 7l10 10M17 7L7 17" />);
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </>,
);
export const AlertIcon = icon(
  <>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </>,
);
export const StructureIcon = icon(
  <>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
  </>,
);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const MinusIcon = icon(<path d="M5 12h14" />);
export const InboxIcon = icon(
  <>
    <path d="M4 13l2.5-7h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <path d="M4 13h5l1 2h4l1-2h5" />
  </>,
);
