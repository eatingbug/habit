/**
 * The KV seam. `src/data` is pure TS (§2.2): it must not import a storage driver, so
 * `LocalRepository` talks to this three-method interface and takes its driver as an
 * argument. The platform adapters that implemented it are gone (#57); `MemoryKV` below
 * is the only implementation left.
 *
 * Values are **strings**, which is what a key-value driver stores; serialisation is the
 * repository's job, so a driver swap cannot change what is stored.
 */
export interface KVStore {
  /** `null` — not just `undefined` — when the key was never written. */
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * In-memory `KVStore`. This is what makes the repository testable with no device and
 * no driver.
 */
export class MemoryKV implements KVStore {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}
