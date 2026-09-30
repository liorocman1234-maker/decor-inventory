import { fmtDate } from './format'
import { findShortages, isLowStock, type StockIndex } from './stock'
import type { DB, Supplier } from './types'

export interface ShoppingLine {
  key: string
  itemId: string
  /** Null when a low-stock item has several variants and the team decides which to buy. */
  variantId: string | null
  label: string
  reasons: string[]
  quantity: number
  unitCost: number
}

export interface ShoppingGroup {
  supplier: Supplier | null
  lines: ShoppingLine[]
}

/** What needs buying, grouped by supplier: shortages for open events, then low stock. */
export function buildShoppingList(db: DB, stock: StockIndex): ShoppingGroup[] {
  const lines = new Map<string, ShoppingLine>()

  // Overlapping events report the same missing units, so a variant needs its largest shortage, not the sum.
  for (const { event, line, missing } of findShortages(db, stock)) {
    const item = stock.itemOf(line.variant_id)
    if (!item || item.archived) continue
    const entry = lines.get(line.variant_id) ?? {
      key: line.variant_id,
      itemId: item.id,
      variantId: line.variant_id,
      label: stock.label(line.variant_id),
      reasons: [],
      quantity: 0,
      unitCost: item.cost_price,
    }
    entry.quantity = Math.max(entry.quantity, missing)
    entry.reasons.push(`חסרות ${missing} ל${event.name} (${fmtDate(event.event_date)})`)
    lines.set(line.variant_id, entry)
  }

  for (const item of db.items) {
    if (!isLowStock(item, stock)) continue
    const owned = stock.itemOwned(item.id)
    const variants = stock.variantsOf(item.id)
    const alreadyListed = variants.reduce((sum, v) => sum + (lines.get(v.id)?.quantity ?? 0), 0)
    const needed = Math.max(1, item.min_quantity - owned) - alreadyListed
    if (needed <= 0) continue
    const reason = `מלאי נמוך: נשארו ${owned}, הסף הוא ${item.min_quantity}`
    const single = variants.length === 1 ? variants[0] : null
    const existing = single && lines.get(single.id)
    if (existing) {
      existing.quantity += needed
      existing.reasons.push(reason)
      continue
    }
    const key = single?.id ?? item.id
    lines.set(key, { key, itemId: item.id, variantId: single?.id ?? null, label: item.name, reasons: [reason], quantity: needed, unitCost: item.cost_price })
  }

  const groups = new Map<string, ShoppingGroup>()
  for (const line of lines.values()) {
    const supplier = db.suppliers.find((s) => s.id === stock.itemById.get(line.itemId)?.supplier_id) ?? null
    const group = groups.get(supplier?.id ?? '') ?? { supplier, lines: [] }
    group.lines.push(line)
    groups.set(supplier?.id ?? '', group)
  }
  return [...groups.values()].sort((a, b) =>
    !a.supplier ? 1 : !b.supplier ? -1 : a.supplier.name.localeCompare(b.supplier.name, 'he'),
  )
}

/** The order as a chat message, ready for WhatsApp or the clipboard. */
export function orderMessage(group: ShoppingGroup, quantities: Record<string, number>): string {
  const greeting = group.supplier?.contact_name ? `שלום ${group.supplier.contact_name},` : 'שלום,'
  const rows = group.lines
    .filter((l) => (quantities[l.key] ?? l.quantity) > 0)
    .map((l) => `• ${l.label}: ${quantities[l.key] ?? l.quantity} יח׳`)
  return [greeting, 'אשמח להזמין:', ...rows, 'תודה!'].join('\n')
}

/** wa.me wants an international number without punctuation; local Israeli numbers start with 0. */
export function whatsappLink(phone: string, message: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 9) return null
  const international = digits.startsWith('0') ? `972${digits.slice(1)}` : digits
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`
}
