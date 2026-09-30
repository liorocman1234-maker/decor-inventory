import type { DB, Row, TableName } from './types'

// Parents before children, so inserts in this order satisfy the foreign keys.
export const TABLES: TableName[] = [
  'categories',
  'suppliers',
  'custom_fields',
  'items',
  'variants',
  'kits',
  'kit_items',
  'events',
  'event_items',
  'movements',
]

export const emptyDb = (): DB => ({
  categories: [],
  suppliers: [],
  custom_fields: [],
  items: [],
  variants: [],
  kits: [],
  kit_items: [],
  events: [],
  event_items: [],
  movements: [],
})

export type Op = {
  [T in TableName]:
    | { type: 'insert'; table: T; row: Row<T> }
    | { type: 'update'; table: T; id: string; patch: Partial<Row<T>> }
    | { type: 'delete'; table: T; id: string }
}[TableName]

export const ins = <T extends TableName>(table: T, row: Row<T>) => ({ type: 'insert', table, row }) as Op
export const upd = <T extends TableName>(table: T, id: string, patch: Partial<Row<T>>) =>
  ({ type: 'update', table, id, patch }) as Op
export const del = (table: TableName, id: string) => ({ type: 'delete', table, id }) as Op

/** Fills in the id and timestamp every row carries. */
export const newRow = <T extends object>(data: T) => ({
  id: crypto.randomUUID(),
  created_at: new Date().toISOString(),
  ...data,
})

/**
 * Applies ops to an in-memory copy of the database. Deletes cascade here the
 * same way the foreign keys in supabase/schema.sql do, so both backends agree.
 */
export function applyOps(db: DB, ops: Op[]): DB {
  const next: DB = { ...db }
  for (const op of ops) {
    if (op.type === 'insert') {
      setRows(next, op.table, [...rows(next, op.table), op.row])
    } else if (op.type === 'update') {
      setRows(
        next,
        op.table,
        rows(next, op.table).map((r) => (r.id === op.id ? { ...r, ...op.patch } : r)),
      )
    } else {
      cascadeDelete(next, op.table, new Set([op.id]))
    }
  }
  return next
}

type AnyRow = { id: string }
const rows = (db: DB, table: TableName) => db[table] as AnyRow[]
const setRows = (db: DB, table: TableName, value: AnyRow[]) => {
  ;(db as unknown as Record<TableName, AnyRow[]>)[table] = value
}

function cascadeDelete(db: DB, table: TableName, ids: Set<string>) {
  if (ids.size === 0) return
  db[table] = rows(db, table).filter((r) => !ids.has(r.id)) as never

  switch (table) {
    case 'items':
      cascadeDelete(db, 'variants', new Set(db.variants.filter((v) => ids.has(v.item_id)).map((v) => v.id)))
      break
    case 'variants':
      db.event_items = db.event_items.filter((l) => !ids.has(l.variant_id))
      db.kit_items = db.kit_items.filter((l) => !ids.has(l.variant_id))
      db.movements = db.movements.filter((m) => !ids.has(m.variant_id))
      break
    case 'kits':
      db.kit_items = db.kit_items.filter((l) => !ids.has(l.kit_id))
      break
    case 'events':
      db.event_items = db.event_items.filter((l) => !ids.has(l.event_id))
      db.movements = db.movements.map((m) => (m.event_id && ids.has(m.event_id) ? { ...m, event_id: null } : m))
      break
    case 'categories':
      db.items = db.items.map((i) => (i.category_id && ids.has(i.category_id) ? { ...i, category_id: null } : i))
      break
    case 'suppliers':
      db.items = db.items.map((i) => (i.supplier_id && ids.has(i.supplier_id) ? { ...i, supplier_id: null } : i))
      break
  }
}
