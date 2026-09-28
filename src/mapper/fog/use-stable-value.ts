import { useState } from 'react';

/** Returns the previous reference while `same` reports the value unchanged. */
export function useStableValue<T>(value: T, same: (previous: T, next: T) => boolean): T {
  const [stable, setStable] = useState(value);
  if (stable === value || same(stable, value)) return stable;
  setStable(value);
  return value;
}
