import { ins, newRow, upd, del, type Op } from './db'
import { addDays } from './format'
import type { DB, DecorEvent, EventItem, Item, MovementKind, Variant } from './types'

export type StockIndex = ReturnType<typeof buildStock>

/**
 * Derives every quantity the UI shows from the raw tables.
 * `today` (YYYY-MM-DD) is a parameter so the date logic stays testable.
 */
export function buildStock(db: DB, today: string) {
  const itemById = new Map(db.items.map((i) => [i.id, i]))
  const variantById = new Map(db.variants.map((v) => [v.id, v]))
  const eventById = new Map(db.events.map((e) => [e.id, e]))

  const variantsByItem = new Map<string, Variant[]>()
  for (const v of db.variants) push(variantsByItem, v.item_id, v)

  const ownedMap = new Map<string, number>()
  for (const m of db.movements) add(ownedMap, m.variant_id, m.quantity)

  const linesByVariant = new Map<string, EventItem[]>()
  const linesByEvent = new Map<string, EventItem[]>()
  const outMap = new Map<string, number>()
  for (const line of db.event_items) {
    push(linesByVariant, line.variant_id, line)
    push(linesByEvent, line.event_id, line)
    if (eventById.get(line.event_id)?.status === 'out') add(outMap, line.variant_id, line.quantity)
  }

  const variantsOf = (itemId: string) => variantsByItem.get(itemId) ?? []
  const itemOf = (variantId: string) => itemById.get(variantById.get(variantId)?.item_id ?? '')
  const owned = (variantId: string) => ownedMap.get(variantId) ?? 0
  const out = (variantId: string) => outMap.get(variantId) ?? 0
  const inHouse = (variantId: string) => owned(variantId) - out(variantId)

  /** Units held by open events during [from, to], optionally ignoring one event. */
  function reserved(variantId: string, from: string, to: string, excludeEventId?: string) {
    const item = itemOf(variantId)
    const consumable = item?.tracking === 'consumable'
    // Cleaning days apply on both sides: after the other event, and after the range being checked.
    const buffer = item?.buffer_days ?? 0
    const blockedUntil = addDays(to, buffer)
    let sum = 0
    for (const line of linesByVariant.get(variantId) ?? []) {
      const ev = eventById.get(line.event_id)
      if (!ev || ev.status === 'closed' || ev.id === excludeEventId) continue
      if (consumable) {
        // Consumables do not come back, so any earlier open event still holds them.
        if (ev.event_date <= to) sum += line.quantity
        continue
      }
      // Decor that is still out past its return date stays unavailable until the event is closed.
      const end = ev.status === 'out' && ev.return_date < today ? today : ev.return_date
      if (ev.event_date <= blockedUntil && addDays(end, buffer) >= from) sum += line.quantity
    }
    return sum
  }

  const available = (variantId: string, from: string, to: string, excludeEventId?: string) =>
    owned(variantId) - reserved(variantId, from, to, excludeEventId)

  const sumItem = (itemId: string, fn: (variantId: string) => number) =>
    variantsOf(itemId).reduce((total, v) => total + fn(v.id), 0)

  const label = (variantId: string) => {
    const v = variantById.get(variantId)
    const item = v && itemById.get(v.item_id)
    if (!v || !item) return 'פריט שנמחק'
    return v.name ? `${item.name} · ${v.name}` : item.name
  }

  return {
    itemById,
    variantById,
    eventById,
    variantsOf,
    itemOf,
    label,
    owned,
    out,
    inHouse,
    reserved,
    available,
    linesOfEvent: (eventId: string) => linesByEvent.get(eventId) ?? [],
    linesOfVariant: (variantId: string) => linesByVariant.get(variantId) ?? [],
    itemOwned: (itemId: string) => sumItem(itemId, owned),
    itemOut: (itemId: string) => sumItem(itemId, out),
    itemInHouse: (itemId: string) => sumItem(itemId, inHouse),
    itemAvailable: (itemId: string, from: string, to: string) => sumItem(itemId, (id) => available(id, from, to)),
  }
}

export const newEventItem = (event_id: string, variant_id: string, quantity: number): EventItem =>
  newRow({ event_id, variant_id, quantity, returned: 0, damaged: 0, lost: 0, consumed: 0, sold: 0, packed: false, checked_back: false })

export const isLowStock = (item: Item, stock: StockIndex) =>
  !item.archived && item.min_quantity > 0 && stock.itemOwned(item.id) <= item.min_quantity

/** How many units an event line is short of, given everything else booked on its dates. */
export const shortage = (stock: StockIndex, ev: DecorEvent, line: EventItem) =>
  Math.max(0, line.quantity - stock.available(line.variant_id, ev.event_date, ev.return_date, ev.id))

/** Asked before equipment leaves with lines the stock records cannot cover. Empty when nothing is short. */
export function shortageWarning(stock: StockIndex, ev: DecorEvent): string {
  const short = stock.linesOfEvent(ev.id).filter((line) => shortage(stock, ev, line) > 0)
  if (short.length === 0) return ''
  const names = short.map((line) => `${stock.label(line.variant_id)} (חסרות ${shortage(stock, ev, line)})`).join(', ')
  return `לפי המלאי הרשום חסר ציוד לאירוע: ${names}. לסמן שהציוד יצא בכל זאת?`
}

export interface Shortage {
  event: DecorEvent
  line: EventItem
  missing: number
}

export function findShortages(db: DB, stock: StockIndex): Shortage[] {
  const result: Shortage[] = []
  for (const event of db.events) {
    if (event.status === 'closed') continue
    for (const line of stock.linesOfEvent(event.id)) {
      const missing = shortage(stock, event, line)
      if (missing > 0) result.push({ event, line, missing })
    }
  }
  return result
}

export function movementOp(
  variantId: string,
  kind: MovementKind,
  quantity: number,
  opts: { unitPrice?: number; eventId?: string | null; note?: string; user: string },
): Op {
  return ins(
    'movements',
    newRow({
      variant_id: variantId,
      kind,
      quantity,
      unit_price: opts.unitPrice ?? 0,
      event_id: opts.eventId ?? null,
      note: opts.note ?? '',
      created_by: opts.user,
    }),
  )
}

/** What happened to the units of one event line that did not simply come back. */
export interface LineOutcome {
  damaged: number
  lost: number
  consumed: number
  sold: number
}

export const outcomeTotal = (o: LineOutcome) => o.damaged + o.lost + o.consumed + o.sold

/**
 * Closing an event: records each line's outcome and writes a stock movement
 * for every unit that is not coming back.
 */
export function closeEventOps(
  db: DB,
  stock: StockIndex,
  eventId: string,
  outcomes: Record<string, LineOutcome>,
  user: string,
): Op[] {
  const ops: Op[] = []
  for (const line of db.event_items) {
    if (line.event_id !== eventId) continue
    const o = outcomes[line.id] ?? { damaged: 0, lost: 0, consumed: 0, sold: 0 }
    if (outcomeTotal(o) > line.quantity) throw new Error('outcome exceeds line quantity')
    const item = stock.itemOf(line.variant_id)
    ops.push(upd('event_items', line.id, { ...o, returned: line.quantity - outcomeTotal(o) }))
    for (const kind of ['damaged', 'lost', 'consumed', 'sold'] as const) {
      if (o[kind] === 0) continue
      ops.push(
        movementOp(line.variant_id, kind, -o[kind], {
          unitPrice: kind === 'sold' ? item?.sale_price : item?.cost_price,
          eventId,
          user,
        }),
      )
    }
  }
  ops.push(upd('events', eventId, { status: 'closed' }))
  return ops
}

/** Undoes closeEventOps so a mistake at closing can be corrected. */
export function reopenEventOps(db: DB, eventId: string): Op[] {
  const ops: Op[] = db.movements.filter((m) => m.event_id === eventId).map((m) => del('movements', m.id))
  for (const line of db.event_items) {
    if (line.event_id !== eventId) continue
    ops.push(upd('event_items', line.id, { returned: 0, damaged: 0, lost: 0, consumed: 0, sold: 0, checked_back: false }))
  }
  ops.push(upd('events', eventId, { status: 'out' }))
  return ops
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

function add(map: Map<string, number>, key: string, n: number) {
  map.set(key, (map.get(key) ?? 0) + n)
}
