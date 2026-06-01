'use client';

// The dashboard's primary entry point: a prominent, search-styled affordance
// that focuses the existing global search in the header rather than mounting a
// second search engine. Clicking (or ⌘K, handled globally by GlobalSearch)
// drops the user straight into the cross-source navigator, where typing a
// blueprint name routes to /industry/[id]. Targets the header input by its
// explicit `data-search-input` contract; falls back to a no-op if absent.
export function SearchHero() {
  const focusHeaderSearch = () => {
    const input = document.querySelector<HTMLInputElement>('[data-search-input]');
    if (!input) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    input.focus();
  };

  return (
    <button
      type="button"
      onClick={focusHeaderSearch}
      className="w-full max-w-[1100px] flex items-center gap-3 px-4 py-3.5 mb-6 border-[1.5px] border-border bg-bg text-left rounded-[3px] cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.018)] hover:border-isk-dim"
    >
      <span className="font-mono text-isk text-[13px]">&gt;</span>
      <span className="font-mono text-[13px] text-muted flex-1">
        Search any blueprint or reaction to plan its build…
      </span>
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted border border-border-soft rounded-[2px] px-1.5 py-0.5">
        ⌘K
      </span>
    </button>
  );
}
