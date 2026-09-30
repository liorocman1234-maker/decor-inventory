import { describe, expect, it } from 'vitest'
import { applyOps, del, emptyDb, ins, upd, type Op } from './db'
import { seedDb } from './seed'
import { buildStock, closeEventOps, findShortages, isLowStock, movementOp, newEventItem, reopenEventOps } from './stock'
import type { DB, EventStatus, Tracking } from './types'

const TODAY = '2026-06-10'
const at = '2026-01-01T00:00:00.000Z'

function fixture(tracking: Tracking = 'reusable', buffer_days = 0) {
  const ops: Op[] = [
    ins('items', {
      id: 'item',
      name: 'פמוט',
      category_id: null,
      supplier_id: null,
      tracking,
      location: '',
      description: '',
      image_url: null,
      cost_price: 10,
      sale_price: 25,
      min_quantity: 5,
      buffer_days,
      custom_values: {},
      archived: false,
      created_at: at,
    }),
    ins('variants', { id: 'v', item_id: 'item', name: '', sku: '', created_at: at }),
    movementOp('v', 'purchase', 20, { unitPrice: 10, user: 'test' }),
  ]
  return applyOps(emptyDb(), ops)
}

function withEvent(db: DB, id: string, from: string, to: string, quantity: number, status: EventStatus = 'planned') {
  return applyOps(db, [
    ins('events', { id, name: id, client_name: '', client_phone: '', venue: '', event_date: from, return_date: to, status, notes: '', created_at: at }),
    ins('event_items', { ...newEventItem(id, 'v', quantity), id: `${id}-line` }),
  ])
}

describe('owned and in-house quantities', () => {
  it('sums movements into the owned quantity', () => {
    const db = applyOps(fixture(), [movementOp('v', 'damaged', -3, { user: 'test' }), movementOp('v', 'purchase', 5, { user: 'test' })])
    expect(buildStock(db, TODAY).owned('v')).toBe(22)
  })

  it('counts only events that are out against the warehouse', () => {
    let db = withEvent(fixture(), 'planned', '2026-06-20', '2026-06-21', 4)
    db = withEvent(db, 'out', '2026-06-09', '2026-06-11', 6, 'out')
    const stock = buildStock(db, TODAY)
    expect(stock.out('v')).toBe(6)
    expect(stock.inHouse('v')).toBe(14)
    expect(stock.itemInHouse('item')).toBe(14)
  })
})

describe('availability on a date', () => {
  it('reserves reusable decor only on overlapping dates', () => {
    const db = withEvent(fixture(), 'a', '2026-06-20', '2026-06-21', 8)
    const stock = buildStock(db, TODAY)
    expect(stock.available('v', '2026-06-21', '2026-06-22')).toBe(12)
    expect(stock.available('v', '2026-06-22', '2026-06-23')).toBe(20)
    expect(stock.available('v', '2026-06-18', '2026-06-19')).toBe(20)
  })

  it('ignores the event being edited and closed events', () => {
    let db = withEvent(fixture(), 'a', '2026-06-20', '2026-06-21', 8)
    db = withEvent(db, 'done', '2026-06-20', '2026-06-21', 5, 'closed')
    expect(buildStock(db, TODAY).available('v', '2026-06-20', '2026-06-21', 'a')).toBe(20)
  })

  it('keeps decor that is late coming back unavailable until the event is closed', () => {
    const db = withEvent(fixture(), 'late', '2026-06-01', '2026-06-02', 8, 'out')
    expect(buildStock(db, TODAY).available('v', TODAY, TODAY)).toBe(12)
  })

  it('treats consumables booked for an earlier event as gone for good', () => {
    const db = withEvent(fixture('consumable'), 'a', '2026-06-20', '2026-06-21', 8)
    const stock = buildStock(db, TODAY)
    expect(stock.available('v', '2026-07-15', '2026-07-16')).toBe(12)
    expect(stock.available('v', '2026-06-15', '2026-06-16')).toBe(20)
  })

  it('blocks cleaning days after an event, in both directions', () => {
    const db = withEvent(fixture('reusable', 2), 'a', '2026-06-20', '2026-06-21', 8)
    const stock = buildStock(db, TODAY)
    expect(stock.available('v', '2026-06-23', '2026-06-24')).toBe(12)
    expect(stock.available('v', '2026-06-24', '2026-06-25')).toBe(20)
    // A booking that ends on the 17th still needs its own two cleaning days before the 20th.
    expect(stock.available('v', '2026-06-16', '2026-06-18')).toBe(12)
    expect(stock.available('v', '2026-06-16', '2026-06-17')).toBe(20)
  })

  it('reports a shortage when events overlap beyond the owned quantity', () => {
    let db = withEvent(fixture(), 'a', '2026-06-20', '2026-06-21', 15)
    db = withEvent(db, 'b', '2026-06-21', '2026-06-22', 9)
    const shortages = findShortages(db, buildStock(db, TODAY))
    expect(shortages.map((s) => [s.event.id, s.missing])).toEqual([
      ['a', 4],
      ['b', 4],
    ])
  })
})

describe('closing an event', () => {
  const outcomes = { 'e-line': { damaged: 1, lost: 2, consumed: 0, sold: 3 } }

  it('writes off what did not come back and records the rest as returned', () => {
    let db = withEvent(fixture(), 'e', '2026-06-08', '2026-06-09', 10, 'out')
    db = applyOps(db, closeEventOps(db, buildStock(db, TODAY), 'e', outcomes, 'test'))
    const stock = buildStock(db, TODAY)
    expect(db.events[0].status).toBe('closed')
    expect(db.event_items[0]).toMatchObject({ returned: 4, damaged: 1, lost: 2, sold: 3 })
    expect(stock.owned('v')).toBe(14)
    expect(stock.inHouse('v')).toBe(14)
    // Sales carry the sale price, losses the cost price.
    expect(db.movements.find((m) => m.kind === 'sold')?.unit_price).toBe(25)
    expect(db.movements.find((m) => m.kind === 'lost')?.unit_price).toBe(10)
  })

  it('rejects outcomes that exceed the quantity sent out', () => {
    const db = withEvent(fixture(), 'e', '2026-06-08', '2026-06-09', 5, 'out')
    expect(() => closeEventOps(db, buildStock(db, TODAY), 'e', outcomes, 'test')).toThrow()
  })

  it('can be reopened, restoring the stock', () => {
    let db = withEvent(fixture(), 'e', '2026-06-08', '2026-06-09', 10, 'out')
    db = applyOps(db, closeEventOps(db, buildStock(db, TODAY), 'e', outcomes, 'test'))
    db = applyOps(db, reopenEventOps(db, 'e'))
    const stock = buildStock(db, TODAY)
    expect(stock.owned('v')).toBe(20)
    expect(stock.out('v')).toBe(10)
    expect(db.event_items[0].returned).toBe(0)
  })
})

describe('database ops', () => {
  it('cascades an item delete to its variants, bookings and movements', () => {
    let db = withEvent(fixture(), 'e', '2026-06-20', '2026-06-21', 3)
    db = applyOps(db, [del('items', 'item')])
    expect([db.variants.length, db.event_items.length, db.movements.length]).toEqual([0, 0, 0])
    expect(db.events.length).toBe(1)
  })

  it('flags low stock at or below the threshold', () => {
    let db = fixture()
    expect(isLowStock(db.items[0], buildStock(db, TODAY))).toBe(false)
    db = applyOps(db, [movementOp('v', 'lost', -15, { user: 'test' })])
    expect(isLowStock(db.items[0], buildStock(db, TODAY))).toBe(true)
    db = applyOps(db, [upd('items', 'item', { archived: true })])
    expect(isLowStock(db.items[0], buildStock(db, TODAY))).toBe(false)
  })
})

describe('demo data', () => {
  it('builds a consistent database with one deliberate shortage', () => {
    const db = seedDb(TODAY)
    const stock = buildStock(db, TODAY)
    expect(db.event_items.every((l) => stock.variantById.has(l.variant_id))).toBe(true)
    expect(db.variants.every((v) => stock.owned(v.id) >= 0)).toBe(true)
    expect(findShortages(db, stock).map((s) => s.missing)).toEqual([4])
  })
})
