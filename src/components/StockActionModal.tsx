import { useState, type FormEvent } from 'react'
import { MOVEMENT_LABELS } from '../lib/format'
import { movementOp } from '../lib/stock'
import { useStore } from '../lib/store'
import type { Item, MovementKind, Variant } from '../lib/types'
import { Field, Modal, MoneyInput, NumberInput } from './ui'

const ACTIONS: { kind: MovementKind; label: string; hint: string }[] = [
  { kind: 'purchase', label: 'הוספה למלאי', hint: 'רכישה או קבלת סחורה' },
  { kind: 'consumed', label: 'נצרך', hint: 'נגמר בשימוש' },
  { kind: 'sold', label: 'נמכר', hint: 'נמכר ללקוח' },
  { kind: 'damaged', label: 'נשבר', hint: 'ניזוק ויצא משימוש' },
  { kind: 'lost', label: 'אבד', hint: 'לא חזר ולא נמצא' },
  { kind: 'adjust', label: 'תיקון ספירה', hint: 'הכמות בפועל שונה מהרשום' },
]

/** Records a stock change on one variant outside of an event. */
export default function StockActionModal({ item, variant, onClose }: { item: Item; variant: Variant; onClose: () => void }) {
  const { stock, user, commit, notify } = useStore()
  const owned = stock.owned(variant.id)
  const inHouse = stock.inHouse(variant.id)

  const [kind, setKind] = useState<MovementKind>('purchase')
  // For a count correction this is the counted total; otherwise the number of units moved.
  const [quantity, setQuantity] = useState(1)
  const [price, setPrice] = useState(item.cost_price)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  function pick(next: MovementKind) {
    setKind(next)
    setQuantity(next === 'adjust' ? owned : 1)
    setPrice(next === 'sold' ? item.sale_price : item.cost_price)
  }

  const delta = kind === 'adjust' ? quantity - owned : kind === 'purchase' ? quantity : -quantity
  const removing = kind !== 'purchase' && kind !== 'adjust'
  const tooMany = removing && quantity > inHouse

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (delta === 0 || tooMany) return
    setSaving(true)
    const ok = await commit([movementOp(variant.id, kind, delta, { unitPrice: kind === 'adjust' ? item.cost_price : price, note: note.trim(), user })])
    if (ok) {
      notify(`${MOVEMENT_LABELS[kind]}: ${Math.abs(delta)} יח׳`)
      onClose()
    } else {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="עדכון מלאי"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" form="stock-form" className="btn btn-primary" disabled={saving || delta === 0 || tooMany}>
            שמירה
          </button>
        </>
      }
    >
      <form id="stock-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm">
          <b className="font-medium">{stock.label(variant.id)}</b>
          <span className="block text-xs text-muted">
            בבעלות {owned}, מתוכן {inHouse} במחסן
          </span>
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ACTIONS.map((a) => (
            <label
              key={a.kind}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${kind === a.kind ? 'border-ink bg-ink/5 font-medium' : 'border-line'}`}
            >
              <input type="radio" name="kind" className="sr-only" checked={kind === a.kind} onChange={() => pick(a.kind)} />
              {a.label}
              <span className="block text-xs font-normal text-muted">{a.hint}</span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === 'adjust' ? 'כמה יש בפועל' : 'כמות'}>
            <NumberInput value={quantity} onChange={setQuantity} min={kind === 'adjust' ? 0 : 1} />
          </Field>
          {kind === 'purchase' || kind === 'sold' ? (
            <Field label={kind === 'sold' ? 'מחיר מכירה ליחידה (₪)' : 'עלות ליחידה (₪)'}>
              <MoneyInput key={kind} value={price} onChange={setPrice} />
            </Field>
          ) : null}
        </div>

        {tooMany ? <p className="text-sm text-wine">במחסן יש רק {inHouse} יח׳.</p> : null}
        {kind === 'adjust' && delta !== 0 ? (
          <p className="text-sm text-muted">
            המלאי הרשום {delta > 0 ? 'יגדל' : 'יקטן'} ב-{Math.abs(delta)} יח׳.
          </p>
        ) : null}

        <Field label="הערה">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="לא חובה" />
        </Field>
      </form>
    </Modal>
  )
}
