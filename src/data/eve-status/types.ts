// Tranquility's status as the nav surfaces it. A discriminated union so the
// offline state carries no player count: `players` exists only when we actually
// reached ESI and the server answered. `vip` is the restricted window right
// after daily downtime (server up, only VIP accounts can log in).
export type ServerStatus =
  | { state: 'online' | 'vip'; players: number }
  | { state: 'offline' };
