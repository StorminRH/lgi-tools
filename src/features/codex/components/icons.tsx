import { strokeIcon } from '@/components/ui/icons';

export const PencilIcon = strokeIcon(
  <>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </>,
);
export const HistoryIcon = strokeIcon(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const BoldIcon = strokeIcon(<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />);
export const ItalicIcon = strokeIcon(<path d="M10 5h8M6 19h8M14 5l-4 14" />);
export const BulletIcon = strokeIcon(
  <>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" />
    <circle cx="4.5" cy="12" r="1" />
    <circle cx="4.5" cy="18" r="1" />
  </>,
);
export const NumberedIcon = strokeIcon(
  <>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M4 5l1.5-1v5M3.5 14.5a1.5 1.5 0 0 1 3 .5c0 1-3 2-3 3.5h3" />
  </>,
);
export const LinkIcon = strokeIcon(
  <>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </>,
);
export const CalloutIcon = strokeIcon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M7 4v16" />
    <path d="M11 9h6M11 13h4" />
  </>,
);
