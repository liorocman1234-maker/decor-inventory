import { describe, expect, it } from 'vitest'
import { parseDelimited } from './csv'
import { applyOps, emptyDb } from './db'
import { planImport, TEMPLATE_EXAMPLE, TEMPLATE_HEADERS } from './importItems'
import { seedDb } from './seed'
import { buildShoppingList, orderMessage, whatsappLink } from './shopping'
import { buildStock } from './stock'

const TODAY = '2026-06-10'

describe('parseDelimited', () => {
  it('reads quoted CSV cells with commas, quotes and line breaks', () => {
    expect(parseDelimited('a,"b, ""c""",d\r\n"two\nlines",,x\n')).toEqual([
      ['a', 'b, "c"', 'd'],
      ['two\nlines', '', 'x'],
    ])
  })

  it('detects tab-separated cells pasted from Excel and keeps inch marks', () => {
    expect(parseDelimited('שם פריט\tוריאנט\nפמוט, פליז\t20 ס"מ')).toEqual([
      ['שם פריט', 'וריאנט'],
      ['פמוט, פליז', '20 ס"מ'],
    ])
  })
})

describe('planImport', () => {
  it('groups rows into items with variants and creates categories and suppliers', () => {
    const plan = planImport(emptyDb(), [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE], 'test')
    expect(plan).toMatchObject({ items: 2, variants: 3, units: 254, categories: 2, suppliers: 1, skipped: [] })

    const db = applyOps(emptyDb(), plan.ops)
    const stock = buildStock(db, TODAY)
    const candlestick = db.items.find((i) => i.name === 'פמוט פליז')!
    expect(stock.variantsOf(candlestick.id).map((v) => v.name)).toEqual(['20 ס"מ', '30 ס"מ'])
    expect(stock.itemOwned(candlestick.id)).toBe(54)
    expect(candlestick).toMatchObject({ cost_price: 45, min_quantity: 10, tracking: 'reusable' })
    expect(db.items.find((i) => i.name === 'נר טפטוף')).toMatchObject({ tracking: 'consumable', sale_price: 6 })
  })

  it('skips what is already in the inventory instead of changing it', () => {
    const rows = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE]
    const db = applyOps(emptyDb(), planImport(emptyDb(), rows, 'test').ops)
    const again = planImport(db, [...rows, ['פמוט פליז', '40 ס"מ', '', '6']], 'test')
    expect(again).toMatchObject({ items: 0, variants: 1, units: 6, categories: 0 })
    expect(again.skipped).toHaveLength(3)
  })

  it('explains when the name column is missing', () => {
    expect(planImport(emptyDb(), [['כמות'], ['5']], 'test').error).toContain('שם פריט')
  })
})

describe('shopping list', () => {
  const db = seedDb(TODAY)
  const groups = buildShoppingList(db, buildStock(db, TODAY))
  const find = (label: string) => groups.flatMap((g) => g.lines.map((line) => ({ line, supplier: g.supplier?.name }))).find((x) => x.line.label === label)

  it('lists event shortages under the item supplier', () => {
    expect(find('פמוט פליז · 30 ס"מ')).toMatchObject({ supplier: 'שוק הפשפשים יפו', line: { quantity: 4 } })
  })

  it('lists low stock, and puts items without a supplier last', () => {
    expect(find('נר צף')).toMatchObject({ supplier: 'נרות הגליל', line: { quantity: 5 } })
    expect(find('זר אקליפטוס מיובש')?.supplier).toBeUndefined()
    expect(groups.at(-1)?.supplier).toBeNull()
  })

  it('builds a WhatsApp link with an international number', () => {
    const group = groups.find((g) => g.supplier?.name === 'שוק הפשפשים יפו')!
    const message = orderMessage(group, {})
    expect(message).toContain('שלום אבי,')
    expect(message).toContain('פמוט פליז · 30 ס"מ: 4 יח׳')
    expect(whatsappLink('050-0000001', 'hi')).toBe('https://wa.me/972500000001?text=hi')
    expect(whatsappLink('', 'hi')).toBeNull()
  })
})
