import { CharacterPortrait } from '@/components/character-portrait';
import type { CodexCredit } from './queries';

export function CodexFooter({ credits }: { credits: readonly CodexCredit[] }) {
  return (
    <footer className="mt-14 border-t border-border-soft pt-6">
      {credits.length > 0 ? (
        <>
          <div className="mb-4 font-ui text-label font-semibold uppercase tracking-eyebrow text-muted">Contributors</div>
          <ul className="mb-6 flex flex-wrap gap-x-6 gap-y-4">
            {credits.map((credit) => (
              <li key={credit.characterId} className="flex items-center gap-2.5">
                <CharacterPortrait characterId={credit.characterId} name={credit.name} size={36} />
                <span className="leading-tight">
                  <span className="block font-ui text-ui font-medium text-name">{credit.name}</span>
                  <span className="block font-data text-label tabular-nums text-faint">
                    {credit.edits} {credit.edits === 1 ? 'edit' : 'edits'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="font-ui text-label text-faint">
        Text available under{' '}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          className="text-muted underline-offset-2 hover:text-name hover:underline"
        >
          CC BY-SA 4.0
        </a>
        . EVE Online data and images © Fenris Creations.
      </p>
    </footer>
  );
}
