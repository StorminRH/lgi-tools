'use client';

import { Pagination } from '@/components/ui/pagination';

export function QueuePager({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  return (
    <Pagination
      page={page}
      pageCount={pageCount}
      total={total}
      pageSize={pageSize}
      hrefForPage={(target) => `/admin/codex?page=${target}`}
      label="Suggestion pages"
      className="border-t border-border-soft px-4 py-3"
    />
  );
}
