export interface IdentityProjectionRunners {
  readonly runBeforeUserDelete: (userId: string) => Promise<void>;
  readonly runBeforeCharacterUnlink: (args: {
    userId: string;
    characterId: number;
  }) => Promise<void>;
  readonly runAfterFailedCharacterUnlink: (characterId: number) => Promise<void>;
  readonly runAfterCharacterLinkChanged: (args: {
    userId: string;
    characterId: number;
  }) => Promise<void>;
}
