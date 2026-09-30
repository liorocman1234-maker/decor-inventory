import { ins, newRow, type Op } from './db'
import { SPINE_COLORS } from './format'
import { movementOp } from './stock'
import type { DB, Tracking } from './types'

/** Column headers we recognise, in the order they appear in the downloadable template. */
const COLUMNS = {
  name: ['שם פריט', 'שם הפריט', 'פריט', 'שם', 'name', 'item'],
  variant: ['וריאנט', 'צבע', 'מידה', 'variant'],
  category: ['קטגוריה', 'category'],
  quantity: ['כמות', 'מלאי', 'quantity', 'qty'],
  cost: ['עלות ליחידה', 'עלות', 'מחיר עלות', 'cost'],
  sale: ['מחיר מכירה', 'מחיר', 'price'],
  location: ['מיקום', 'מיקום במחסן', 'מדף', 'location'],
  supplier: ['ספק', 'supplier'],
  tracking: ['סוג', 'type'],
  sku: ['מקט', 'sku'],
  min: ['מלאי מינימום', 'מינימום', 'min'],
} as const
type Column = keyof typeof COLUMNS

export const TEMPLATE_HEADERS = ['שם פריט', 'וריאנט', 'קטגוריה', 'כמות', 'עלות ליחידה', 'מחיר מכירה', 'מיקום', 'ספק', 'סוג', 'מק״ט', 'מלאי מינימום']
export const TEMPLATE_EXAMPLE = [
  ['פמוט פליז', '20 ס"מ', 'פמוטים', '30', '45', '', 'מדף B1', 'שוק הפשפשים', 'חוזר', '', '10'],
  ['פמוט פליז', '30 ס"מ', 'פמוטים', '24', '45', '', 'מדף B1', 'שוק הפשפשים', 'חוזר', '', '10'],
  ['נר טפטוף', '', 'נרות', '200', '3', '6', 'ארגז D1', '', 'מתכלה', '', '100'],
]

export interface ImportPlan {
  ops: Op[]
  /** Set when the sheet cannot be imported at all. */
  error?: string
  items: number
  variants: number
  units: number
  categories: number
  suppliers: number
  /** Rows left out, with the reason, for the preview. */
  skipped: string[]
}

// Gershayim and quotes vary between keyboards (מק"ט, מק״ט), so compare without them.
const norm = (value: unknown) =>
  String(value ?? '')
    .replace(/["״'׳]/g, '')
    .trim()
    .toLowerCase()
const text = (value: unknown) => String(value ?? '').trim()
const number = (value: unknown) => Math.max(0, Number(String(value ?? '').replace(/[^\d.]/g, '')) || 0)

/**
 * Turns spreadsheet rows (first row = headers) into database ops.
 * Rows that share an item name become variants of one item. Nothing already
 * in the inventory is changed: existing variants are skipped, not updated.
 */
export function planImport(db: DB, rows: unknown[][], user: string): ImportPlan {
  const plan: ImportPlan = { ops: [], items: 0, variants: 0, units: 0, categories: 0, suppliers: 0, skipped: [] }
  const [header = [], ...data] = rows

  const col = {} as Record<Column, number>
  for (const key of Object.keys(COLUMNS) as Column[]) {
    col[key] = header.findIndex((h) => (COLUMNS[key] as readonly string[]).includes(norm(h)))
  }
  if (col.name === -1) return { ...plan, error: 'לא נמצאה עמודה בשם "שם פריט" בשורה הראשונה.' }
  const cell = (row: unknown[], key: Column) => (col[key] === -1 ? '' : row[col[key]])

  const categories = new Map(db.categories.map((c) => [norm(c.name), c.id]))
  const suppliers = new Map(db.suppliers.map((s) => [norm(s.name), s.id]))
  const items = new Map(db.items.map((i) => [norm(i.name), { id: i.id, cost: i.cost_price }]))
  const variants = new Set(db.variants.map((v) => `${v.item_id}/${norm(v.name)}`))

  const lookup = (map: Map<string, string>, name: string, create: () => string) => {
    if (!name) return null
    const found = map.get(norm(name))
    if (found) return found
    const id = create()
    map.set(norm(name), id)
    return id
  }

  for (const row of data) {
    const name = text(cell(row, 'name'))
    if (!name) continue

    let item = items.get(norm(name))
    if (!item) {
      const category_id = lookup(categories, text(cell(row, 'category')), () => {
        const category = newRow({ name: text(cell(row, 'category')), color: SPINE_COLORS[categories.size % SPINE_COLORS.length] })
        plan.ops.push(ins('categories', category))
        plan.categories++
        return category.id
      })
      const supplier_id = lookup(suppliers, text(cell(row, 'supplier')), () => {
        const supplier = newRow({ name: text(cell(row, 'supplier')), contact_name: '', phone: '', email: '', notes: '' })
        plan.ops.push(ins('suppliers', supplier))
        plan.suppliers++
        return supplier.id
      })
      const tracking: Tracking = /מתכל|consum/.test(norm(cell(row, 'tracking'))) ? 'consumable' : 'reusable'
      const created = newRow({
        name,
        category_id,
        supplier_id,
        tracking,
        location: text(cell(row, 'location')),
        description: '',
        image_url: null,
        cost_price: number(cell(row, 'cost')),
        sale_price: number(cell(row, 'sale')),
        min_quantity: Math.round(number(cell(row, 'min'))),
        buffer_days: 0,
        custom_values: {},
        archived: false,
      })
      plan.ops.push(ins('items', created))
      plan.items++
      item = { id: created.id, cost: created.cost_price }
      items.set(norm(name), item)
    }

    const variantName = text(cell(row, 'variant'))
    const variantKey = `${item.id}/${norm(variantName)}`
    if (variants.has(variantKey)) {
      plan.skipped.push(`${name}${variantName ? ` · ${variantName}` : ''}: כבר קיים במלאי`)
      continue
    }
    variants.add(variantKey)

    const variant = newRow({ item_id: item.id, name: variantName, sku: text(cell(row, 'sku')) })
    plan.ops.push(ins('variants', variant))
    plan.variants++

    const quantity = Math.round(number(cell(row, 'quantity')))
    if (quantity > 0) {
      plan.ops.push(movementOp(variant.id, 'purchase', quantity, { unitPrice: item.cost, note: 'ייבוא מאקסל', user }))
      plan.units += quantity
    }
  }

  if (plan.ops.length === 0 && plan.skipped.length === 0) plan.error = 'לא נמצאו שורות עם שם פריט.'
  return plan
}
