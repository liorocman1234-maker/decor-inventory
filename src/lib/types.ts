/** reusable: goes out to an event and comes back. consumable: used up or sold. */
export type Tracking = 'reusable' | 'consumable'
export type EventStatus = 'planned' | 'out' | 'closed'
export type MovementKind = 'purchase' | 'adjust' | 'consumed' | 'sold' | 'damaged' | 'lost'
export type FieldType = 'text' | 'number' | 'select'

export interface Category {
  id: string
  name: string
  color: string
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  contact_name: string
  phone: string
  email: string
  notes: string
  created_at: string
}

/** A field the team defines themselves; values live in Item.custom_values keyed by field id. */
export interface CustomField {
  id: string
  name: string
  field_type: FieldType
  options: string[]
  created_at: string
}

export interface Item {
  id: string
  name: string
  category_id: string | null
  supplier_id: string | null
  tracking: Tracking
  location: string
  description: string
  image_url: string | null
  cost_price: number
  sale_price: number
  /** Low-stock threshold on the item's total owned quantity. 0 disables the alert. */
  min_quantity: number
  /** Days after an event's return date before the item can go out again (laundry, cleaning). */
  buffer_days: number
  custom_values: Record<string, string>
  archived: boolean
  created_at: string
}

/** Every item has at least one variant; a single variant with an empty name means "no variants". */
export interface Variant {
  id: string
  item_id: string
  name: string
  sku: string
  created_at: string
}

export interface DecorEvent {
  id: string
  name: string
  client_name: string
  client_phone: string
  venue: string
  /** YYYY-MM-DD: the day the decor leaves the warehouse. */
  event_date: string
  /** YYYY-MM-DD: the day it is expected back. */
  return_date: string
  status: EventStatus
  notes: string
  created_at: string
}

export interface EventItem {
  id: string
  event_id: string
  variant_id: string
  quantity: number
  // Outcome, filled when the event is closed. The five always sum to quantity.
  returned: number
  damaged: number
  lost: number
  consumed: number
  sold: number
  /** Ticked in packing mode when the line is loaded for the event. */
  packed: boolean
  /** Ticked in packing mode when the line is counted back into the warehouse. */
  checked_back: boolean
  created_at: string
}

/** A reusable per-table recipe, e.g. "vintage table": 3 books, 2 candlesticks, 1 vase. */
export interface Kit {
  id: string
  name: string
  notes: string
  created_at: string
}

export interface KitItem {
  id: string
  kit_id: string
  variant_id: string
  /** Units for one table. */
  quantity: number
  created_at: string
}

/** Append-only stock ledger. Owned quantity of a variant is the sum of its movements. */
export interface Movement {
  id: string
  variant_id: string
  kind: MovementKind
  /** Signed delta: positive adds stock, negative removes it. */
  quantity: number
  unit_price: number
  event_id: string | null
  note: string
  created_by: string
  created_at: string
}

export interface DB {
  categories: Category[]
  suppliers: Supplier[]
  custom_fields: CustomField[]
  items: Item[]
  variants: Variant[]
  kits: Kit[]
  kit_items: KitItem[]
  events: DecorEvent[]
  event_items: EventItem[]
  movements: Movement[]
}

export type TableName = keyof DB
export type Row<T extends TableName> = DB[T][number]
