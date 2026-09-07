import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SPEC §2.2 dependency rule: UI imports Domain and Data, but nothing in Domain or
 * Data imports React. Asserted mechanically so it survives every later ticket.
 *
 * The ban extends to the storage drivers, which encodes the KV seam: `src/data` holds
 * only the repository interface, `LocalRepository(kv)`, `MemoryKV` and the Supabase
 * stub — all pure and testable without a device. The platform-specific KV adapters
 * (AsyncStorage on native, localforage on web) live in `src/context`, the one layer
 * allowed to know which platform it is running on.
 */
function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFilesUnder(path));
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe('layer dependency rule (SPEC §2.2)', () => {
  for (const layer of ['domain', 'data'] as const) {
    it(`no file in src/${layer} imports React or a React-only module`, () => {
      const offenders = sourceFilesUnder(join(__dirname, '..', layer)).filter((path) =>
        /(^|\n)\s*import[^;]*from\s+['"](react|react-native|expo[-/][^'"]*|@react-native-async-storage[^'"]*|localforage)['"]/.test(
          readFileSync(path, 'utf8'),
        ),
      );
      expect(offenders).toEqual([]);
    });
  }
});
