'use client';

export function NoMapAccess() {
  return (
    <section
      data-chain-no-access
      className="flex h-full w-full items-center justify-center px-6 text-center"
    >
      <div className="flex max-w-xl flex-col items-center gap-3">
        <h2 className="font-display text-title font-bold tracking-copy text-name">
          You don&rsquo;t have access to this map&nbsp;<span className="text-isk">o7</span>
        </h2>
        <p className="text-body leading-relaxed text-text">
          Open another map, or ask a map admin for access.
        </p>
      </div>
    </section>
  );
}
