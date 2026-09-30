import { useState } from 'react'
import { closeEventOps, outcomeTotal, type LineOutcome } from '../lib/stock'
import { useStore } from '../lib/store'
import type { DecorEvent } from '../lib/types'
import { Modal, NumberInput } from './ui'

const COLUMNS: [keyof LineOutcome, string][] = [
  ['damaged', 'נשבר'],
  ['lost', 'אבד'],
  ['consumed', 'נצרך'],
  ['sold', 'נמכר'],
]

/**
 * Closing an event. Only the exceptions are typed in; whatever is left of each
 * line counts as returned to the warehouse.
 */
export default function CloseEventModal({ event, onClose }: { event: DecorEvent; onClose: () => void }) {
  const { db, stock, user, commit, notify } = useStore()
  const lines = stock.linesOfEvent(event.id)
  const [outcomes, setOutcomes] = useState<Record<string, LineOutcome>>(() =>
    Object.fromEntries(
      lines.map((l) => {
        // Consumables are assumed used up; the team corrects the number if some came back.
        const consumed = stock.itemOf(l.variant_id)?.tracking === 'consumable' ? l.quantity : 0
        return [l.id, { damaged: 0, lost: 0, consumed, sold: 0 }]
      }),
    ),
  )
  const [saving, setSaving] = useState(false)

  const invalid = lines.some((l) => outcomeTotal(outcomes[l.id]) > l.quantity)

  async function save() {
    setSaving(true)
    if (await commit(closeEventOps(db, stock, event.id, outcomes, user))) {
      notify('האירוע נסגר והמלאי עודכן')
      onClose()
    } else {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide
      title="סגירת אירוע והחזרת ציוד"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button type="button" className="btn btn-primary" disabled={saving || invalid} onClick={() => void save()}>
            סגירת האירוע
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">ממלאים רק מה שלא חזר. כל השאר נרשם כחזר למחסן.</p>
      <ul className="divide-y divide-line">
        {lines.map((line) => {
          const outcome = outcomes[line.id]
          const returned = line.quantity - outcomeTotal(outcome)
          return (
            <li key={line.id} className="py-3">
              <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{stock.label(line.variant_id)}</span>
                <span className={`shrink-0 ${returned < 0 ? 'text-wine' : 'text-muted'}`}>
                  {returned < 0 ? `יותר מדי: יצאו רק ${line.quantity}` : `יצאו ${line.quantity}, חוזרות ${returned}`}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {COLUMNS.map(([key, label]) => (
                  <label key={key}>
                    <span className="label text-center">{label}</span>
                    <NumberInput
                      value={outcome[key]}
                      onChange={(n) => setOutcomes((all) => ({ ...all, [line.id]: { ...all[line.id], [key]: n } }))}
                    />
                  </label>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
