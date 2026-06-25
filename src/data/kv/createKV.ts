import { Platform } from "react-native";
import { KVStore } from "./KVStore";
import { LocalforageKV } from "./LocalforageKV";
import { AsyncStorageKV } from "./AsyncStorageKV";

export function createKV(): KVStore {
  return Platform.OS === "web" ? new LocalforageKV() : new AsyncStorageKV();
}
