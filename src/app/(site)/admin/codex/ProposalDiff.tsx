import type { ReactNode } from 'react';
import type { CodexBlockDiff } from '@/features/codex/diff';

const INS = 'rounded-sm border-b border-isk/45 bg-isk/12 px-0.5 text-isk no-underline';
const DEL = 'rounded-sm bg-dps-high/12 px-0.5 text-dps-high decoration-dps-high/70';
const NOTE = 'font-ui text-ui italic text-muted';

function entryBody(entry: CodexBlockDiff): ReactNode {
  switch (entry.kind) {
    case 'added':
      return <ins className={INS}>{entry.text}</ins>;
    case 'removed':
      return <del className={DEL}>{entry.text}</del>;
    case 'moved':
      return <span className={NOTE}>Block moved from position {entry.from + 1} to {entry.to + 1}.</span>;
  }
  if ('change' in entry) return <span className={NOTE}>Formatting changed; the text is the same.</span>;
  if ('attrs' in entry) {
    return entry.attrs.map(({ name, before, after }) => (
      <span key={name} className="block font-data text-ui">
        {name}: <del className={DEL}>{before || 'none'}</del> <ins className={INS}>{after || 'none'}</ins>
      </span>
    ));
  }
  return entry.words.map((part, index) =>
    part.op === 'same' ? (
      <span key={index}>{part.text}</span>
    ) : part.op === 'added' ? (
      <ins key={index} className={INS}>
        {part.text}
      </ins>
    ) : (
      <del key={index} className={DEL}>
        {part.text}
      </del>
    ),
  );
}

export function ProposalDiff({ diff }: { diff: readonly CodexBlockDiff[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-ctl border border-border-soft bg-bg-deep/60 px-4 py-3.5 font-ui text-nav leading-[1.75] text-text">
      {diff.length === 0 ? (
        <p className={NOTE}>No changes to the section text.</p>
      ) : (
        diff.map((entry, index) => (
          <p key={`${entry.kind}-${entry.id}-${index}`} className="whitespace-pre-wrap">
            {entryBody(entry)}
          </p>
        ))
      )}
    </div>
  );
}
