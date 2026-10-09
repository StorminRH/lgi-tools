import type { ReactNode } from 'react';

type IconProps = { size?: number; className?: string };

export function strokeIcon(paths: ReactNode) {
  return function StrokeIcon({ size = 16, className }: IconProps) {
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

export const CopyIcon = strokeIcon(
  <>
    <rect x="9" y="9" width="11" height="11" rx="3" />
    <path d="M5 15V7a3 3 0 0 1 3-3h7" />
  </>,
);
export const CheckIcon = strokeIcon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const ChevronDownIcon = strokeIcon(<path d="M6 9l6 6 6-6" />);
export const SearchIcon = strokeIcon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4-4" />
  </>,
);
export const CloseIcon = strokeIcon(<path d="M7 7l10 10M17 7L7 17" />);
export const InfoIcon = strokeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </>,
);
export const AlertIcon = strokeIcon(
  <>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </>,
);
export const RetryIcon = strokeIcon(
  <>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </>,
);
export const StarIcon = strokeIcon(
  <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />,
);
export const InboxIcon = strokeIcon(
  <>
    <path d="M4 13l2.5-7h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <path d="M4 13h5l1 2h4l1-2h5" />
  </>,
);
