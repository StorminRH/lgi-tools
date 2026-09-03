export function pairKey(a: number, b: number): string {
  return a < b ? `${a}>${b}` : `${b}>${a}`;
}
