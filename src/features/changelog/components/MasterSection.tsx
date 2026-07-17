import type { ChangelogMaster } from '../parse';
import { EntryCard } from './EntryCard';

/**
 * A master version: a section heading (themed for new masters, a bare version
 * number for historical ones) over its sub-versions, each still drawn as a
 * timeline node by EntryCard.
 */
export function MasterSection({ master }: { master: ChangelogMaster }) {
  return (
    <section className="changelog-master">
      <div className="changelog-master-head">
        <span className="changelog-master-ver">v{master.version}</span>
        {master.title && (
          <>
            <span className="changelog-master-dash" aria-hidden="true">
              —
            </span>
            <span className="changelog-master-title">{master.title}</span>
          </>
        )}
      </div>
      {master.summary.length > 0 && (
        <div className="changelog-master-summary">
          {master.summary.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}
      {master.subVersions.map((entry) => (
        <EntryCard key={`${entry.version}-${entry.date}`} entry={entry} />
      ))}
    </section>
  );
}
