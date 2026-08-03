import { describe, expect, it } from 'vitest';
import { __TEST_ONLY__, readWindowRecord, writeWindowRecord } from './persistence';

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('window persistence', () => {
  it('round-trips exact floating geometry', () => {
    const storage = new MemoryStorage();
    const record = {
      v: 1 as const,
      mode: 'floating' as const,
      rect: { x: 17.25, y: 44, width: 381, height: 522 },
    };

    writeWindowRecord(record, storage);

    expect(readWindowRecord(storage)).toEqual(record);
  });

  it('keeps the last floating rect when re-anchored', () => {
    const storage = new MemoryStorage();
    const rect = { x: 17, y: 44, width: 381, height: 522 };
    writeWindowRecord({ v: 1, mode: 'docked', rect }, storage);

    expect(readWindowRecord(storage)).toEqual({ v: 1, mode: 'docked', rect });
  });

  it('treats malformed and unavailable storage as no record', () => {
    const storage = new MemoryStorage();
    storage.setItem(__TEST_ONLY__.STORAGE_KEY, '{broken');
    expect(readWindowRecord(storage)).toBeNull();
    expect(readWindowRecord(null)).toBeNull();
    storage.setItem(
      __TEST_ONLY__.STORAGE_KEY,
      JSON.stringify({
        v: 1,
        mode: 'floating',
        rect: { x: 0, y: 0, width: 1, height: 1 },
      }),
    );
    expect(readWindowRecord(storage)).toBeNull();
  });

  it('swallows setItem failures', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };

    expect(() =>
      writeWindowRecord({ v: 1, mode: 'docked' }, storage),
    ).not.toThrow();
  });
});
