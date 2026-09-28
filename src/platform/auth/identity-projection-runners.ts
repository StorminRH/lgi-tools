export interface IdentityProjectionRunners {
  readonly runBeforeUserDelete: (userId: string) => Promise<void>;
  readonly runBeforeCharacterUnlink: (args: {
    userId: string;
    characterId: number;
  }) => Promise<string[]>;
  readonly runAfterFailedCharacterUnlink: (characterId: number) => Promise<void>;
  readonly runAfterCharacterUnlink: (args: {
    userId: string;
    characterId: number;
    mapIds: string[];
  }) => Promise<void>;
  readonly runAfterCharacterLinkChanged: (args: {
    userId: string;
    characterId: number;
  }) => Promise<void>;
}
