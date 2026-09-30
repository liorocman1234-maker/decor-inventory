import { applyOps, emptyDb, ins, newRow, type Op } from './db'
import { addDays, SPINE_COLORS } from './format'
import { buildStock, closeEventOps, movementOp, newEventItem } from './stock'
import type { DB, Tracking } from './types'

const USER = 'הדגמה'

/** Example data for demo mode, so the app can be explored before real stock is entered. */
export function seedDb(today: string): DB {
  const ops: Op[] = []

  const category = (name: string, i: number) => {
    const row = newRow({ name, color: SPINE_COLORS[i] })
    ops.push(ins('categories', row))
    return row.id
  }
  const books = category('ספרים', 0)
  const candlesticks = category('פמוטים', 2)
  const vases = category('אגרטלים', 9)
  const candles = category('נרות', 8)
  const textile = category('טקסטיל', 5)
  const greenery = category('צמחייה', 1)
  const signage = category('שילוט ומעמדים', 4)

  const supplier = (name: string, contact_name: string, phone: string) => {
    const row = newRow({ name, contact_name, phone, email: '', notes: '' })
    ops.push(ins('suppliers', row))
    return row.id
  }
  const fleaMarket = supplier('שוק הפשפשים יפו', 'אבי', '050-0000001')
  const candleMaker = supplier('נרות הגליל', 'רונית', '050-0000002')
  const fabrics = supplier('טקסטיל הדר', 'מיכל', '050-0000003')

  const style = newRow({ name: 'סגנון', field_type: 'select' as const, options: ['וינטג\'', 'כפרי', 'מודרני', 'קלאסי'] })
  const size = newRow({ name: 'מידות', field_type: 'text' as const, options: [] })
  ops.push(ins('custom_fields', style), ins('custom_fields', size))

  const variantIds: Record<string, string> = {}
  const item = (
    name: string,
    category_id: string,
    opts: {
      tracking?: Tracking
      supplier?: string
      cost: number
      sale?: number
      min?: number
      buffer?: number
      location: string
      custom?: Record<string, string>
      variants: [name: string, quantity: number][]
    },
  ) => {
    const row = newRow({
      name,
      category_id,
      supplier_id: opts.supplier ?? null,
      tracking: opts.tracking ?? 'reusable',
      location: opts.location,
      description: '',
      image_url: null,
      cost_price: opts.cost,
      sale_price: opts.sale ?? 0,
      min_quantity: opts.min ?? 0,
      buffer_days: opts.buffer ?? 0,
      custom_values: opts.custom ?? {},
      archived: false,
    })
    ops.push(ins('items', row))
    for (const [variantName, quantity] of opts.variants) {
      const variant = newRow({ item_id: row.id, name: variantName, sku: '' })
      variantIds[variantName ? `${name}/${variantName}` : name] = variant.id
      ops.push(ins('variants', variant))
      ops.push(movementOp(variant.id, 'purchase', quantity, { unitPrice: opts.cost, note: 'מלאי פתיחה', user: USER }))
    }
  }

  item('ספר וינטג\' בכריכה קשה', books, {
    supplier: fleaMarket,
    cost: 12,
    location: 'מדף A1',
    custom: { [style.id]: 'וינטג\'' },
    variants: [['בורדו', 40], ['ירוק בקבוק', 35], ['כחול נייבי', 30], ['קרם', 50]],
  })
  item('ערימת ספרים קשורה בחוט', books, {
    supplier: fleaMarket,
    cost: 35,
    location: 'מדף A2',
    custom: { [style.id]: 'כפרי' },
    variants: [['', 24]],
  })
  item('פמוט פליז', candlesticks, {
    supplier: fleaMarket,
    cost: 45,
    min: 10,
    location: 'מדף B1',
    custom: { [style.id]: 'קלאסי' },
    variants: [['20 ס"מ', 30], ['30 ס"מ', 24]],
  })
  item('פמוט זכוכית נמוך', candlesticks, { cost: 9, location: 'מדף B2', variants: [['', 60]] })
  item('אגרטל זכוכית ענבר', vases, {
    cost: 28,
    location: 'מדף C1',
    custom: { [size.id]: 'קטן: 12 ס"מ, גדול: 25 ס"מ' },
    variants: [['קטן', 40], ['גדול', 20]],
  })
  item('אגרטל קרמיקה לבן', vases, { cost: 40, location: 'מדף C2', variants: [['', 25]] })
  item('נר טפטוף', candles, {
    tracking: 'consumable',
    supplier: candleMaker,
    cost: 3,
    sale: 6,
    min: 100,
    location: 'ארגז D1',
    variants: [['שנהב', 200], ['בורדו', 80]],
  })
  item('נר צף', candles, {
    tracking: 'consumable',
    supplier: candleMaker,
    cost: 2,
    sale: 4,
    min: 60,
    location: 'ארגז D2',
    variants: [['', 55]],
  })
  item('ראנר פשתן', textile, {
    supplier: fabrics,
    cost: 60,
    buffer: 2,
    location: 'ארון E',
    custom: { [size.id]: '40 על 280 ס"מ' },
    variants: [['טבעי', 30], ['ירוק זית', 18]],
  })
  item('זר אקליפטוס מיובש', greenery, { cost: 25, min: 6, location: 'מדף F1', variants: [['', 5]] })
  item('מעמד עץ למספר שולחן', signage, { cost: 18, sale: 35, location: 'מדף G1', variants: [['', 40]] })

  const kit = (name: string, notes: string, list: [key: string, quantity: number][]) => {
    const row = newRow({ name, notes })
    ops.push(ins('kits', row))
    for (const [key, quantity] of list) {
      ops.push(ins('kit_items', newRow({ kit_id: row.id, variant_id: variantIds[key], quantity })))
    }
  }
  kit("שולחן וינטג' קלאסי", 'שולחן עגול ל-10 אורחים', [
    ["ספר וינטג' בכריכה קשה/בורדו", 3],
    ['פמוט פליז/20 ס"מ', 2],
    ['אגרטל זכוכית ענבר/קטן', 1],
    ['נר טפטוף/שנהב', 4],
    ['ראנר פשתן/טבעי', 1],
  ])
  kit('שולחן כפרי', '', [
    ['ערימת ספרים קשורה בחוט', 1],
    ['אגרטל קרמיקה לבן', 1],
    ['נר צף', 3],
    ['ראנר פשתן/ירוק זית', 1],
  ])

  const lines = (eventId: string, list: [key: string, quantity: number][]) => {
    for (const [key, quantity] of list) {
      ops.push(ins('event_items', newEventItem(eventId, variantIds[key], quantity)))
    }
  }
  const event = (name: string, venue: string, offset: number, status: 'planned' | 'out') => {
    const row = newRow({
      name,
      client_name: '',
      client_phone: '',
      venue,
      event_date: addDays(today, offset),
      return_date: addDays(today, offset + 1),
      status,
      notes: '',
    })
    ops.push(ins('events', row))
    return row.id
  }

  const past = event('החתונה של שירה ודניאל', 'חוות האלה', -20, 'out')
  lines(past, [
    ['ספר וינטג\' בכריכה קשה/קרם', 30],
    ['אגרטל זכוכית ענבר/קטן', 20],
    ['נר טפטוף/שנהב', 60],
    ['מעמד עץ למספר שולחן', 22],
  ])

  const current = event('החתונה של מאיה ויונתן', 'גן הברושים', -1, 'out')
  lines(current, [
    ['ספר וינטג\' בכריכה קשה/בורדו', 24],
    ['פמוט פליז/20 ס"מ', 18],
    ['ראנר פשתן/טבעי', 14],
    ['נר טפטוף/בורדו', 40],
  ])

  const soon = event('החתונה של נועה ואיתי', 'בית על הים', 3, 'planned')
  lines(soon, [
    ['ספר וינטג\' בכריכה קשה/ירוק בקבוק', 28],
    ['ערימת ספרים קשורה בחוט', 16],
    ['פמוט זכוכית נמוך', 48],
    ['אגרטל קרמיקה לבן', 16],
    ['נר צף', 48],
  ])

  // Deliberately asks for more 30cm candlesticks than exist, to show the shortage warning.
  const later = event('החתונה של תמר ועומר', 'היקב בעמק', 10, 'planned')
  lines(later, [
    ['פמוט פליז/30 ס"מ', 28],
    ['ספר וינטג\' בכריכה קשה/כחול נייבי', 20],
    ['ראנר פשתן/ירוק זית', 12],
    ['נר טפטוף/שנהב', 80],
  ])

  let db = applyOps(emptyDb(), ops)
  const pastLines = db.event_items.filter((l) => l.event_id === past)
  const outcome = (key: string) => pastLines.find((l) => l.variant_id === variantIds[key])!.id
  db = applyOps(
    db,
    closeEventOps(
      db,
      buildStock(db, today),
      past,
      {
        [outcome('אגרטל זכוכית ענבר/קטן')]: { damaged: 2, lost: 0, consumed: 0, sold: 0 },
        [outcome('נר טפטוף/שנהב')]: { damaged: 0, lost: 0, consumed: 60, sold: 0 },
        [outcome('מעמד עץ למספר שולחן')]: { damaged: 0, lost: 1, consumed: 0, sold: 4 },
      },
      USER,
    ),
  )
  return db
}
