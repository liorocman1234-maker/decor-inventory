import { emptyDb, type Op } from './db'
import { todayISO } from './format'
import { blobToDataUrl, resizeImage } from './image'
import { seedDb } from './seed'
import type { DB } from './types'

/**
 * Where the data lives. The app talks only to this interface, so the same UI
 * runs on Supabase (shared between devices) or on this browser's localStorage.
 */
export interface Backend {
  mode: 'local' | 'cloud'
  /** Resolves to the signed-in user's name, or null when sign-in is required. */
  init(): Promise<string | null>
  signIn(email: string, password: string): Promise<string>
  signOut(): Promise<void>
  load(): Promise<DB>
  /** Persists ops that were already applied in memory; `next` is the resulting database. */
  apply(ops: Op[], next: DB): Promise<void>
  uploadImage(file: File): Promise<string>
  /** Calls back when another device or tab changes the data. */
  subscribe(onChange: () => void): () => void
}

/** Thrown by load() when the signed-in user is not on the team list. */
export const NOT_MEMBER = 'NOT_MEMBER'

const STORAGE_KEY = 'decor-inventory:v1'

/** Fills in tables and fields added after the data was first saved in this browser. */
const upgrade = (saved: DB): DB => ({
  ...emptyDb(),
  ...saved,
  items: saved.items.map((i) => ({ ...i, buffer_days: i.buffer_days ?? 0 })),
  event_items: saved.event_items.map((l) => ({ ...l, packed: l.packed ?? false, checked_back: l.checked_back ?? false })),
})

function createLocalBackend(): Backend {
  const save = (db: DB) => localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  return {
    mode: 'local',
    init: async () => 'מצב הדגמה',
    signIn: async () => 'מצב הדגמה',
    signOut: async () => {},
    async load() {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return upgrade(JSON.parse(raw) as DB)
      const db = seedDb(todayISO())
      save(db)
      return db
    },
    async apply(_ops, next) {
      save(next)
    },
    // Photos share localStorage's few megabytes with the data, so keep them small.
    uploadImage: async (file) => blobToDataUrl(await resizeImage(file, 420)),
    subscribe(onChange) {
      const handler = (e: StorageEvent) => e.key === STORAGE_KEY && onChange()
      window.addEventListener('storage', handler)
      return () => window.removeEventListener('storage', handler)
    },
  }
}

export async function createBackend(): Promise<Backend> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined
  if (!url || !key) return createLocalBackend()
  // Loaded on demand so demo mode does not ship the Supabase client.
  const { createCloudBackend } = await import('./supabaseBackend')
  return createCloudBackend(url, key)
}
