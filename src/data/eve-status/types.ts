export type ServerStatus =
  | { state: 'online' | 'vip'; players: number }
  | { state: 'offline' };
