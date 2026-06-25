/**
 * util/id.ts — UUID generation for new entities.
 *
 * expo-crypto's randomUUID() works on web and native with no polyfill (SPEC plan).
 */
import * as Crypto from 'expo-crypto';

export function newId(): string {
  return Crypto.randomUUID();
}
