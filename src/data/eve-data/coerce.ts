export function intOrNull(v: unknown): number | null {
  return typeof v === 'number' ? Math.trunc(v) : null;
}

export function numOrNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

export function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function boolOf(v: unknown): boolean {
  return v === true;
}

export function localizedEn(v: unknown): string | null {
  if (
    v &&
    typeof v === 'object' &&
    typeof (v as { en?: unknown }).en === 'string'
  ) {
    return (v as { en: string }).en;
  }
  return null;
}
