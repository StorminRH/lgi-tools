import type { ChangelogMaster } from '../parse';
import { EntryCard } from './EntryCard';

/**
 * A master version: a section heading (themed for new masters, a bare version
 * number for historical ones) over its sub-versions, each still drawn as a
 * timeline node by EntryCard.
 */
export function MasterSection({ master }: { master: ChangelogMaster }) {
  return (
    <section className="mb-11 last:mb-0">
      <div className="mb-[22px] flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-b border-border pb-3">
        <span className="font-display text-stat font-bold uppercase leading-none tracking-[0.01em] text-name">v{master.version}</span>
        {master.title && (
          <>
            <span className="hidden font-display text-h2 font-semibold leading-[1.2] text-muted sm:inline" aria-hidden="true">
              —
            </span>
            <span className="font-display text-h2 font-semibold leading-[1.2] tracking-[0.01em] text-isk">{master.title}</span>
          </>
        )}
      </div>
      {master.summary.length > 0 && (
        <div className="-mt-2 mb-[26px] flex max-w-[72ch] flex-col gap-[0.7em]">
          {master.summary.map((para, i) => (
            <p key={i} className="m-0 text-pretty font-body text-body leading-[1.65] tracking-[0.01em] text-text">{para}</p>
          ))}
        </div>
      )}
      {master.subVersions.map((entry) => (
        <EntryCard key={`${entry.version}-${entry.date}`} entry={entry} />
      ))}
    </section>
  );
}
