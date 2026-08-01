'use client';

// The calm state shown when the caller does not hold access to the map (contract IS-5 / DC-4).
//
// Reached from a live access VALUE, not from a caught error: `watchMapAccess` reports access as
// `{ granted }`, so losing access is an ordinary state transition the canvas renders. There is no
// error boundary in this path and nothing throws. A re-granted claim flips the same subscription back
// and the map returns with no reload, which is why there is deliberately no retry control here
// (contract HC-4).

/**
 * Explains that map access is not held, without claiming prior access existed.
 *
 * The same copy is correct for a live revocation and for a map the caller never had, and it carries
 * no spinner, retry, or reload affordance.
 */
export function NoMapAccess() {
  return (
    <section
      data-chain-no-access
      className="flex h-full w-full items-center justify-center px-6 text-center"
    >
      <div className="flex max-w-xl flex-col items-center gap-3">
        <div className="font-data text-label uppercase tracking-eyebrow text-muted">
          Atlas · access
        </div>
        {/* Deliberately NOT uppercased, unlike other display headings: `o7` is the salute and `O7`
            is not, so the house uppercase treatment would break the word. The non-breaking space
            keeps the salute from wrapping onto a line of its own. */}
        <h2 className="font-display text-title font-bold tracking-copy text-name">
          You&rsquo;ve lost access to this map&nbsp;<span className="text-isk">o7</span>
        </h2>
        <p className="text-body leading-relaxed text-text">
          Another map can be opened from the atlas or access can be restored by the
          map&rsquo;s owner.
        </p>
      </div>
    </section>
  );
}
