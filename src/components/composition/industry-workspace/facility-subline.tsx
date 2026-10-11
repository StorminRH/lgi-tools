import { SystemWithSecurity } from '@/components/security-status';

/** What a facility is and where: its hull or station, then its system and security. */
export function FacilitySubline({
  kind,
  system,
}: {
  kind: string;
  system: { name: string; security: number | null } | null;
}) {
  return (
    <span className="truncate font-data text-micro text-muted">
      {kind}
      {system ? (
        <>
          {' · '}
          <SystemWithSecurity system={system} />
        </>
      ) : null}
    </span>
  );
}
