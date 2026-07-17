/**
 * One caller-supplied pagination item; its value is the stable control key and its label or marker
 * is presentation-ready.
 */
export type PaginationItem = number | 'ellipsis';

/**
 * Returns the compact pagination window as page numbers and ellipsis markers, preserving the
 * first, last, current, and neighboring pages.
 */
export function paginationItems(page: number, pageCount: number): PaginationItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const visible = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const result: PaginationItem[] = [];
  for (const value of visible) {
    const previous = result.at(-1);
    if (typeof previous === 'number' && value - previous > 1) result.push('ellipsis');
    result.push(value);
  }
  return result;
}
