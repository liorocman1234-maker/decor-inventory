import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { EmptyState, Field, LinkTabs, Modal, NumberInput, PageHeader } from '../components/ui'
import { del, ins, newRow, upd, type Op } from '../lib/db'
import { fmtMoney } from '../lib/format'
import { useStore } from '../lib/store'
import type { Kit } from '../lib/types'

export const INVENTORY_TABS: [string, string][] = [
  ['/inventory', 'פריטים'],
  ['/kits', 'סטים לשולחן'],
]

export default function Kits() {
  const { db, stock, commit, notify } = useStore()
  const [editing, setEditing] = useState<Kit | 'new' | null>(null)

  async function remove(kit: Kit) {
    if (!confirm(`למחוק את הסט "${kit.name}"? אירועים שכבר השתמשו בו לא ישתנו.`)) return
    if (await commit([del('kits', kit.id)])) notify('הסט נמחק')
  }

  return (
    <>
      <PageHeader title="מלאי" subtitle="סט הוא הרכב של שולחן אחד. באירוע בוחרים סט ומספר שולחנות, והכמויות מחושבות לבד.">
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} />
          סט חדש
        </button>
      </PageHeader>
      <LinkTabs tabs={INVENTORY_TABS} />

      {db.kits.length === 0 ? (
        <EmptyState title="עדיין אין סטים" hint="מגדירים פעם אחת מה יש על שולחן, למשל 3 ספרים, 2 פמוטים ואגרטל, ומשתמשים בזה בכל אירוע.">
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            יצירת סט ראשון
          </button>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {db.kits
            .toSorted((a, b) => a.name.localeCompare(b.name, 'he'))
            .map((kit) => {
              const lines = db.kit_items.filter((l) => l.kit_id === kit.id)
              const cost = lines.reduce((sum, l) => sum + l.quantity * (stock.itemOf(l.variant_id)?.cost_price ?? 0), 0)
              return (
                <li key={kit.id} className="card flex flex-col p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-lg font-bold">{kit.name}</p>
                    <div className="flex shrink-0">
                      <button className="btn btn-ghost btn-sm px-2" aria-label={`עריכת ${kit.name}`} onClick={() => setEditing(kit)}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm px-2 text-wine" aria-label={`מחיקת ${kit.name}`} onClick={() => void remove(kit)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {kit.notes ? <p className="text-xs text-muted">{kit.notes}</p> : null}
                  <ul className="my-3 space-y-1">
                    {lines.map((l) => (
                      <li key={l.id} className="flex justify-between gap-3">
                        <span className="truncate">{stock.label(l.variant_id)}</span>
                        <span className="shrink-0 font-medium">{l.quantity}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-auto border-t border-line pt-2 text-xs text-muted">שווי הציוד לשולחן: {fmtMoney(cost)}</p>
                </li>
              )
            })}
        </ul>
      )}

      {editing ? <KitForm kit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </>
  )
}

interface LineDraft {
  /** Set for lines that already exist in the database. */
  id?: string
  key: string
  variant_id: string
  quantity: number
}

function KitForm({ kit, onClose }: { kit?: Kit; onClose: () => void }) {
  const { db, stock, commit, notify } = useStore()
  const [name, setName] = useState(kit?.name ?? '')
  const [notes, setNotes] = useState(kit?.notes ?? '')
  const [lines, setLines] = useState<LineDraft[]>(() =>
    kit
      ? db.kit_items.filter((l) => l.kit_id === kit.id).map((l) => ({ id: l.id, key: l.id, variant_id: l.variant_id, quantity: l.quantity }))
      : [{ key: crypto.randomUUID(), variant_id: '', quantity: 1 }],
  )
  const [saving, setSaving] = useState(false)

  const options = useMemo(
    () =>
      db.variants
        .filter((v) => !stock.itemById.get(v.item_id)?.archived)
        .map((v) => ({ id: v.id, label: stock.label(v.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'he')),
    [db.variants, stock],
  )
  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const chosen = lines.filter((l) => l.variant_id && l.quantity > 0)
    if (chosen.length === 0) return notify('בסט צריך להיות לפחות פריט אחד.', 'error')
    if (new Set(chosen.map((l) => l.variant_id)).size < chosen.length) return notify('אותו פריט מופיע בסט פעמיים. אפשר לאחד לשורה אחת.', 'error')

    setSaving(true)
    const kitId = kit?.id ?? crypto.randomUUID()
    const ops: Op[] = [kit ? upd('kits', kit.id, { name: name.trim(), notes }) : ins('kits', { ...newRow({ name: name.trim(), notes }), id: kitId })]
    const kept = new Set(chosen.map((l) => l.id))
    for (const old of db.kit_items) if (old.kit_id === kitId && !kept.has(old.id)) ops.push(del('kit_items', old.id))
    for (const line of chosen) {
      if (line.id) ops.push(upd('kit_items', line.id, { variant_id: line.variant_id, quantity: line.quantity }))
      else ops.push(ins('kit_items', newRow({ kit_id: kitId, variant_id: line.variant_id, quantity: line.quantity })))
    }
    if (await commit(ops)) {
      notify(kit ? 'הסט עודכן' : 'הסט נוצר')
      onClose()
    } else {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide
      title={kit ? 'עריכת סט' : 'סט חדש'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" form="kit-form" className="btn btn-primary" disabled={saving}>
            {kit ? 'שמירת שינויים' : 'יצירת סט'}
          </button>
        </>
      }
    >
      <form id="kit-form" onSubmit={submit} className="space-y-4">
        <Field label="שם הסט">
          <input className="input" required autoFocus={!kit} value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: שולחן וינטג' קלאסי" />
        </Field>
        <Field label="הערה">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="לא חובה, למשל: שולחן עגול ל-10 אורחים" />
        </Field>

        <div>
          <p className="label">מה יש על שולחן אחד</p>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.key} className="flex items-center gap-2">
                <select className="input min-w-0 flex-1" aria-label="פריט" value={line.variant_id} onChange={(e) => setLine(line.key, { variant_id: e.target.value })}>
                  <option value="">בחירת פריט</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <NumberInput aria-label="כמות לשולחן" className="w-20" value={line.quantity} onChange={(quantity) => setLine(line.key, { quantity })} min={1} />
                <button type="button" aria-label="הסרת השורה" className="btn btn-ghost px-2" onClick={() => setLines((list) => list.filter((l) => l.key !== line.key))}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm mt-2"
            onClick={() => setLines((list) => [...list, { key: crypto.randomUUID(), variant_id: '', quantity: 1 }])}
          >
            <Plus size={14} />
            פריט נוסף
          </button>
        </div>
      </form>
    </Modal>
  )
}
