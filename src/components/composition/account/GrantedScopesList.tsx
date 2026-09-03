import type { ReactNode } from 'react';
import { Chip } from '@/components/ui/chip';
import { EntityRow } from '@/components/ui/row';
import type { GrantedScope } from '@/platform/auth/scope-health';

export function GrantedScopesList({ scopes }: { scopes: GrantedScope[] }): ReactNode {
  const hasLegacy = scopes.some((s) => s.status === 'legacy');
  return (
    <div>
      {scopes.map((scope) => (
        <EntityRow
          key={scope.id}
          colsClass="grid-cols-[minmax(0,1fr)_auto]"
          name={
            <span className="min-w-0">
            <span className="block truncate font-data text-ui text-name">{scope.id}</span>

            {scope.gloss ? (
              <span className="block text-micro text-muted">{scope.gloss}</span>

            ) : null}
            </span>

          }
          trailing={scope.status === 'active' ? (
            <Chip tone="green">Active</Chip>

          ) : (
            <Chip tone="orange">Legacy</Chip>

          )}
        />
      ))}
      {hasLegacy ? (
        <div className="px-3.5 py-2 border-t border-border-soft text-micro text-muted">
          Legacy — granted earlier, no longer used; safe to revoke.
        </div>

      ) : null}
    </div>

  );
}
