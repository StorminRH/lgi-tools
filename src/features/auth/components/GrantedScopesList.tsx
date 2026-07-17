import type { ReactNode } from 'react';
import { Chip } from '@/components/ui/chip';
import type { GrantedScope } from '../scope-health';

/**
 * Read-only readout of the scopes a character has actually granted (3.7.1.4).
 * Humble component: it receives an already-derived GrantedScope[] from the app
 * layer (page.tsx calls listGrantedScopes off the stored grant) and only renders
 * — no scope parsing, no scope-health import, no tokens. The revocation
 * deep-link is page-level (one CCP URL serves every character), so it isn't here.
 */
export function GrantedScopesList({ scopes }: { scopes: GrantedScope[] }): ReactNode {
  const hasLegacy = scopes.some((s) => s.status === 'legacy');
  return (
    <div>
      {scopes.map((scope) => (
        <div
          key={scope.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3.5 py-[5px] border-t border-border-soft"
        >
          <span className="min-w-0">
            <span className="block font-mono text-ui text-name truncate">{scope.id}</span>
            {scope.gloss ? (
              <span className="block text-micro text-muted">{scope.gloss}</span>
            ) : null}
          </span>
          {scope.status === 'active' ? (
            <Chip tone="green">Active</Chip>
          ) : (
            <Chip tone="orange">Legacy</Chip>
          )}
        </div>
      ))}
      {hasLegacy ? (
        <div className="px-3.5 py-2 border-t border-border-soft text-micro text-muted">
          Legacy — granted earlier, no longer used; safe to revoke.
        </div>
      ) : null}
    </div>
  );
}
