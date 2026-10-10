import { formatSecurityStatus, securityStatusTextClass } from '@/data/eve-data/security';

/** A system's security as the game shows it, in its band's colour; a muted dash when unknown. */
export function SecurityStatus({ security }: { security: number | null }) {
  return <span className={securityStatusTextClass(security)}>{formatSecurityStatus(security)}</span>;
}

/** A system's name followed by its coloured security. */
export function SystemWithSecurity({ system }: { system: { name: string; security: number | null } }) {
  return (
    <>
      {system.name} <SecurityStatus security={system.security} />
    </>
  );
}
