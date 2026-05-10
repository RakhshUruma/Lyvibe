import { openDB, type IDBPDatabase } from "idb";
import type { Lyrics } from "./schema";

const DB = "vj-lyrics";
const STORE = "projects";

interface Schema {
  projects: {
    key: string;
    value: { id: string; updated: number; lyrics: Lyrics; audioName?: string };
  };
}

let _db: Promise<IDBPDatabase<Schema>> | null = null;
const db = (): Promise<IDBPDatabase<Schema>> => {
  if (!_db) {
    _db = openDB<Schema>(DB, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      },
    });
  }
  return _db;
};

export const saveProject = async (id: string, lyrics: Lyrics, audioName?: string): Promise<void> => {
  const d = await db();
  await d.put(STORE, { id, lyrics, audioName, updated: Date.now() });
};

export const loadProject = async (id: string): Promise<Lyrics | null> => {
  const d = await db();
  const r = await d.get(STORE, id);
  return r?.lyrics ?? null;
};

export const listProjects = async (): Promise<Array<{ id: string; updated: number; audioName?: string }>> => {
  const d = await db();
  const all = await d.getAll(STORE);
  return all.map(p => ({ id: p.id, updated: p.updated, audioName: p.audioName }));
};

/** Project ID derived from audio file (name + size) — stable across reloads. */
export const projectIdFor = (file: File): string =>
  `${file.name}::${file.size}`.replace(/\s+/g, "_");
