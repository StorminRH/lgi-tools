export type ServerStatus =
  | {
      state: 'online' | 'vip';
      players: number;
      /** Tranquility's build number. */
      build: string | null;
      /** When the cluster started taking logins, as an ISO time. */
      startedAt: string | null;
    }
  /** ESI answered that Tranquility is down. */
  | { state: 'offline' }
  /** ESI gave no answer to go on, so Tranquility's state is not known. */
  | { state: 'unknown' };

export type LiveServerStatus = Extract<ServerStatus, { players: number }>;

/** The static data build LGI has ingested. */
export interface SdeBuild {
  build: string;
  ingestedAt: Date;
}
