import { useDeferredValue, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { del, ins, upd, type Op } from '../lib/db'
import { newEventItem } from '../lib/stock'
import { useStore } from '../lib/store'
import type { DecorEvent } from '../lib/types'
import { Modal, NumberInput } from './ui'

/** Pick what goes out to an event: every variant, its free quantity on the event's dates, and how many to take. */
export default function EventItemsModal({ event, onClose }: { event: DecorEvent; onClose: () => void }) {
  const { db, stock, commit, notify } = useStore()
  const lines = stock.linesOfEvent(event.id)
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.variant_id, l.quantity])),
  )
  const [query, setQuery] = useState('')
  const [onlyChosen, setOnlyChosen] = useState(false)
  const [kitId, setKitId] = useState('')
  const [tables, setTables] = useState(10)
  const [saving, setSaving] = useState(false)
  const search = useDeferredValue(query).trim().toLowerCase()

  const options = useMemo(() => {
    const onEvent = new Set(lines.map((l) => l.variant_id))
    return db.variants
      .filter((v) => onEvent.has(v.id) || !stock.itemById.get(v.item_id)?.archived)
      .map((v) => ({
        id: v.id,
        label: stock.label(v.id),
        free: stock.available(v.id, event.event_date, event.return_date, event.id),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'he'))
  }, [db.variants, stock, lines, event])

  const visible = options.filter(
    (o) => (!search || o.label.toLowerCase().includes(search)) && (!onlyChosen || (quantities[o.id] ?? 0) > 0),
  )
  const chosen = Object.values(quantities).filter((q) => q > 0).length

  function addKit() {
    const kit = db.kits.find((k) => k.id === kitId)
    if (!kit || tables < 1) return
    setQuantities((current) => {
      const next = { ...current }
      for (const line of db.kit_items) {
        if (line.kit_id === kit.id) next[line.variant_id] = (next[line.variant_id] ?? 0) + line.quantity * tables
      }
      return next
    })
    setOnlyChosen(true)
    notify(`נוסף "${kit.name}" ל-${tables} שולחנות. אפשר לתקן כמויות לפני השמירה.`)
  }

  async function save() {
    setSaving(true)
    const ops: Op[] = []
    const existing = new Map(lines.map((l) => [l.variant_id, l]))
    for (const [variantId, quantity] of Object.entries(quantities)) {
      const line = existing.get(variantId)
      if (line && quantity === 0) ops.push(del('event_items', line.id))
      else if (line && quantity !== line.quantity) ops.push(upd('event_items', line.id, { quantity }))
      else if (!line && quantity > 0) ops.push(ins('event_items', newEventItem(event.id, variantId, quantity)))
    }
    if (await commit(ops)) {
      notify('רשימת הציוד עודכנה')
      onClose()
    } else {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide
      title="ציוד לאירוע"
      onClose={onClose}
      footer={
        <>
          <span className="me-auto self-center text-sm text-muted">נבחרו {chosen} פריטים</span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            שמירת הרשימה
          </button>
        </>
      }
    >
      {db.kits.length ? (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-paper p-3">
          <label className="min-w-40 flex-1">
            <span className="label">הוספה לפי סט לשולחן</span>
            <select className="input" value={kitId} onChange={(e) => setKitId(e.target.value)}>
              <option value="">בחירת סט</option>
              {db.kits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label className="w-24">
            <span className="label">כמה שולחנות</span>
            <NumberInput value={tables} onChange={setTables} min={1} />
          </label>
          <button type="button" className="btn btn-secondary" disabled={!kitId} onClick={addKit}>
            הוספה לרשימה
          </button>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">חיפוש פריט</span>
          <Search size={16} className="pointer-events-none absolute start-3 top-3 text-muted" />
          <input className="input ps-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש פריט" />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-ink" checked={onlyChosen} onChange={(e) => setOnlyChosen(e.target.checked)} />
          רק מה שנבחר
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{options.length ? 'לא נמצאו פריטים מתאימים.' : 'אין עדיין פריטים במלאי.'}</p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((o) => {
            const quantity = quantities[o.id] ?? 0
            const over = quantity > o.free
            return (
              <li key={o.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 text-sm">
                  <span className={quantity ? 'font-medium' : ''}>{o.label}</span>
                  <span className={`block text-xs ${over ? 'text-wine' : 'text-muted'}`}>
                    {over ? `פנויות רק ${Math.max(0, o.free)}, חסרות ${quantity - Math.max(0, o.free)}` : `פנויות בתאריך: ${o.free}`}
                  </span>
                </span>
                <NumberInput
                  aria-label={`כמות: ${o.label}`}
                  className="w-20"
                  value={quantity}
                  onChange={(n) => setQuantities((q) => ({ ...q, [o.id]: n }))}
                />
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
