import { createClient } from '@supabase/supabase-js'
import { NOT_MEMBER, type Backend } from './backend'
import { emptyDb, TABLES, type Op } from './db'
import { resizeImage } from './image'
import type { DB, TableName } from './types'

const IMAGE_BUCKET = 'item-images'
const PAGE_SIZE = 1000

export function createCloudBackend(url: string, key: string): Backend {
  const sb = createClient(url, key)

  // The Data API caps a response at 1000 rows, so page through larger tables.
  async function fetchAll(table: TableName) {
    const result: unknown[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await sb
        .from(table)
        .select('*')
        .order('created_at')
        .order('id')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      result.push(...data)
      if (data.length < PAGE_SIZE) return result
    }
  }

  return {
    mode: 'cloud',

    async init() {
      const { data } = await sb.auth.getSession()
      return data.session?.user.email ?? null
    },

    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw error
      return data.user.email ?? email
    },

    async signOut() {
      await sb.auth.signOut()
    },

    async load() {
      const membership = await sb.from('team_members').select('user_id').limit(1)
      if (membership.error) throw membership.error
      if (membership.data.length === 0) throw new Error(NOT_MEMBER)

      const tables = await Promise.all(TABLES.map(fetchAll))
      const db = emptyDb() as unknown as Record<TableName, unknown[]>
      TABLES.forEach((table, i) => (db[table] = tables[i]))
      return db as unknown as DB
    },

    async apply(ops: Op[]) {
      for (let i = 0; i < ops.length; ) {
        const op = ops[i]
        if (op.type === 'insert') {
          // Send a run of inserts into the same table as one request.
          const batch: unknown[] = []
          while (i < ops.length && ops[i].type === 'insert' && ops[i].table === op.table) {
            batch.push((ops[i] as Extract<Op, { type: 'insert' }>).row)
            i++
          }
          const { error } = await sb.from(op.table).insert(batch)
          if (error) throw error
          continue
        }
        const { error } =
          op.type === 'update'
            ? await sb.from(op.table).update(op.patch).eq('id', op.id)
            : await sb.from(op.table).delete().eq('id', op.id)
        if (error) throw error
        i++
      }
    },

    async uploadImage(file) {
      const path = `${crypto.randomUUID()}.jpg`
      const { error } = await sb.storage
        .from(IMAGE_BUCKET)
        .upload(path, await resizeImage(file, 1000), { contentType: 'image/jpeg' })
      if (error) throw error
      return sb.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
    },

    subscribe(onChange) {
      let timer: ReturnType<typeof setTimeout>
      const debounced = () => {
        clearTimeout(timer)
        timer = setTimeout(onChange, 500)
      }
      const channel = sb
        .channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, debounced)
        .subscribe()
      // Realtime can miss changes while a phone sleeps; refresh when the app comes back.
      const onVisible = () => document.visibilityState === 'visible' && debounced()
      document.addEventListener('visibilitychange', onVisible)
      return () => {
        clearTimeout(timer)
        document.removeEventListener('visibilitychange', onVisible)
        void sb.removeChannel(channel)
      }
    },
  }
}
