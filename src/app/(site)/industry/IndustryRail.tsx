import Link from 'next/link';
import type { ReactNode } from 'react';
import { INDUSTRY_SECTIONS } from './industry-sections';
import type { RailLine, RailSectionId, RailTone } from './overview-model';

const TONE_CLASS: Record<RailTone, string> = {
  isk: 'text-isk',
  name: 'text-name',
  muted: 'text-muted',
  faint: 'text-faint',
  warn: 'text-dps-mid',
};

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-5"
    >
      {children}
    </svg>
  );
}

const GLYPHS: Record<RailSectionId, ReactNode> = {
  jobs: (
    <Glyph>
      <path d="M3 20.5V10l5 3.2V10l5 3.2V5.5h3.5l1 4.5H21v10.5z" />
      <path d="M7 17h2M12 17h2M17 17h1" />
    </Glyph>
  ),
  plan: (
    <Glyph>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M8.5 9.5h7M8.5 13h7M8.5 16.5h4" />
    </Glyph>
  ),
  research: (
    <Glyph>
      <path d="M4 4v16h16" />
      <path d="M7.5 15l3.5-4 3 2.5 5-6" />
    </Glyph>
  ),
  templates: (
    <Glyph>
      <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
      <path d="M3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
    </Glyph>
  ),
};

const RAIL_SECTIONS = INDUSTRY_SECTIONS.filter(
  (section): section is (typeof INDUSTRY_SECTIONS)[number] & { id: RailSectionId } => section.id !== 'overview',
);

/**
 * The workspace's sections as the home board shows its pilots: frameless on
 * the backdrop, each with what it holds right now. On phones it becomes a
 * strip that scrolls on its own.
 */
export function IndustryRail({ summaries }: { summaries: Record<RailSectionId, RailLine[]> }) {
  return (
    <nav
      aria-label="Industry sections"
      className="-mx-4 flex min-w-0 gap-2.5 overflow-x-auto px-4 pb-2 sm:-mx-0 sm:px-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0"
    >
      {RAIL_SECTIONS.map((section) => (
        <Link
          key={section.id}
          href={section.href}
          className="group flex shrink-0 items-center gap-2.5 rounded-card border border-border-soft px-3 py-2 no-underline transition-colors hover:border-border-active lg:items-start lg:gap-3.5 lg:border-transparent lg:p-0 lg:hover:border-transparent"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-ctl border border-border bg-bg-deep/60 text-isk shadow-card-edge transition-shadow duration-300 group-hover:shadow-cta-glow group-focus-visible:shadow-cta-glow lg:size-11">
            {GLYPHS[section.id]}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="whitespace-nowrap font-display text-nav font-bold leading-tight text-name transition-colors group-hover:text-isk-bright lg:text-h3">
              {section.title}
            </span>
            <span className="hidden min-w-0 flex-col gap-0.5 font-data text-micro lg:flex">
              {summaries[section.id].map((segments, index) => (
                <span key={index} className="truncate">
                  {segments.map((segment, part) => (
                    <span key={part} className={TONE_CLASS[segment.tone]}>
                      {segment.text}
                    </span>
                  ))}
                </span>
              ))}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
