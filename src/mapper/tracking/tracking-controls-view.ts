export function trackingToggleLabel(input: {
  readonly name: string;
  readonly tracked: boolean;
  readonly needsLocationReconnect: boolean;
}): string {
  if (input.needsLocationReconnect) {
    return input.tracked
      ? `${input.name} cannot sync location`
      : `Track ${input.name} (reconnect required)`;
  }
  return input.tracked ? `Stop tracking ${input.name}` : `Track ${input.name}`;
}

export function trackingReconnectVisible(
  characters: readonly { readonly needsLocationReconnect: boolean }[],
): boolean {
  return characters.some((character) => character.needsLocationReconnect);
}
