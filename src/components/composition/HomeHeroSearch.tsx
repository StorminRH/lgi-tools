'use client';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';

// The hero's search bar is a large trigger for the header's global search,
// which owns the query, results and ⌘K binding.
function focusGlobalSearch() {
  document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
}

export function HomeHeroSearch() {
  return (
    <Button
      variant="bare"
      onClick={focusGlobalSearch}
      aria-label="Search"
      className="reveal reveal-4 group w-full max-w-[620px] cursor-text gap-3 rounded-sheet border border-border glass-surface glass-lit py-2 pr-2 pl-5 text-left shadow-float transition-[border-color,box-shadow] hover:border-border-active hover:shadow-card-hover"
    >
      <span aria-hidden className="font-data text-body font-bold text-isk">
        &gt;
      </span>
      <span className="flex-1 truncate text-body text-muted transition-colors group-hover:text-text">
        Search tools, sites, resources…
      </span>
      <Kbd className="max-sm:hidden">⌘K</Kbd>
    </Button>
  );
}
