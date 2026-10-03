export type ServerStatus =
  | {
      state: 'online' | 'vip';
      players: number;
      /** Tranquility's build number. */
      build: string | null;
      /** When the cluster started taking logins, as an ISO time. */
      startedAt: string | null;
    }
  | { state: 'offline' };

/** The static data build LGI has ingested. */
export interface SdeBuild {
  build: string;
  ingestedAt: Date;
}
