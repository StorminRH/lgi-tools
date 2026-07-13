'use client';

import { cn } from './cn';
import { paginationItems } from './pagination-model';

const itemClass =
  'inline-flex min-w-[30px] items-center justify-center rounded-ctl border border-border-idle px-2 py-1 ' +
  'font-mono text-label text-text shadow-btn-bezel hover:border-border-active hover:text-name';

interface PageControlProps {
  target: number;
  text: string;
  current: boolean;
  hrefForPage?: (page: number) => string;
  onPageChange?: (page: number) => void;
}

const CURRENT_PAGE = {
  true: {
    className: 'border-isk-dim bg-pill-green-bg text-isk',
    ariaCurrent: 'page',
  },
  false: {
    className: undefined,
    ariaCurrent: undefined,
  },
} as const;

const ignorePageChange = () => undefined;

function PageControl({
  target,
  text,
  current,
  hrefForPage,
  onPageChange = ignorePageChange,
}: PageControlProps) {
  const state = CURRENT_PAGE[String(current) as 'true' | 'false'];
  const classes = cn(itemClass, state.className);
  if (hrefForPage) {
    return (
      <a href={hrefForPage(target)} aria-current={state.ariaCurrent} className={classes}>
        {text}
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled={current}
      onClick={() => onPageChange(target)}
      aria-current={state.ariaCurrent}
      className={classes}
    >
      {text}
    </button>
  );
}

function PaginationEdge({ enabled, ...props }: PageControlProps & { enabled: boolean }) {
  if (!enabled) return <span className={cn(itemClass, 'opacity-40')}>{props.text}</span>;
  return <PageControl {...props} />;
}

function PaginationItemControl({
  item,
  index,
  page,
  hrefForPage,
  onPageChange,
}: {
  item: ReturnType<typeof paginationItems>[number];
  index: number;
  page: number;
  hrefForPage?: (page: number) => string;
  onPageChange?: (page: number) => void;
}) {
  if (item === 'ellipsis') {
    return (
      <span key={`ellipsis-${index}`} className="px-1 text-faint" aria-hidden>
        …
      </span>
    );
  }
  return (
    <PageControl
      target={item}
      text={String(item)}
      current={item === page}
      hrefForPage={hrefForPage}
      onPageChange={onPageChange}
    />
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  hrefForPage,
  onPageChange,
  label = 'Pagination',
  className,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  hrefForPage?: (page: number) => string;
  onPageChange?: (page: number) => void;
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <PaginationEdge
        enabled={page > 1}
        target={page - 1}
        text="‹"
        current={false}
        hrefForPage={hrefForPage}
        onPageChange={onPageChange}
      />
      {paginationItems(page, pageCount).map((item, index) => (
        <PaginationItemControl
          key={`${item}-${index}`}
          item={item}
          index={index}
          page={page}
          hrefForPage={hrefForPage}
          onPageChange={onPageChange}
        />
      ))}
      <PaginationEdge
        enabled={page < pageCount}
        target={page + 1}
        text="›"
        current={false}
        hrefForPage={hrefForPage}
        onPageChange={onPageChange}
      />
      <span className="ml-2 font-mono text-label text-faint">
        {total} rows · {pageSize}/page
      </span>
    </nav>
  );
}
