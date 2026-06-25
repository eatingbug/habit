import localforage from "localforage";
import type { KVStore } from "./KVStore";

export class LocalforageKV implements KVStore {
  async getItem(key: string): Promise<string | null> {
    return localforage.getItem<string>(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await localforage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await localforage.removeItem(key);
  }

  async getAllKeys(): Promise<string[]> {
    return localforage.keys();
  }
}
