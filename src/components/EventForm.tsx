import { useState, type FormEvent } from 'react'
import { ins, newRow, upd } from '../lib/db'
import { newEventItem } from '../lib/stock'
import { addDays, todayISO } from '../lib/format'
import { useStore } from '../lib/store'
import type { DecorEvent } from '../lib/types'
import { Field, Modal } from './ui'

export default function EventForm({
  event,
  copyFrom,
  initialDate,
  onClose,
  onSaved,
}: {
  event?: DecorEvent
  /** Start a new event from another one: same details and equipment list, new dates. */
  copyFrom?: DecorEvent
  initialDate?: string
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { stock, commit, notify } = useStore()
  const base = event ?? copyFrom
  const startDate = event?.event_date ?? initialDate ?? todayISO()
  const [form, setForm] = useState(() => ({
    name: event?.name ?? '',
    client_name: event?.client_name ?? '',
    client_phone: event?.client_phone ?? '',
    venue: base?.venue ?? '',
    event_date: startDate,
    return_date: event?.return_date ?? addDays(startDate, 1),
    notes: base?.notes ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  function setEventDate(value: string) {
    // Keep the return date at least one day after the event unless it was already later.
    setForm((f) => ({ ...f, event_date: value, return_date: value && f.return_date <= value ? addDays(value, 1) : f.return_date }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (form.return_date < form.event_date) return notify('תאריך ההחזרה לא יכול להיות לפני תאריך האירוע.', 'error')
    setSaving(true)
    const data = { ...form, name: form.name.trim() }
    const row = event ?? newRow({ ...data, status: 'planned' as const })
    const ops = [event ? upd('events', event.id, data) : ins('events', row)]
    if (copyFrom) {
      for (const line of stock.linesOfEvent(copyFrom.id)) ops.push(ins('event_items', newEventItem(row.id, line.variant_id, line.quantity)))
    }
    if (await commit(ops)) {
      notify(event ? 'האירוע עודכן' : copyFrom ? 'האירוע שוכפל עם רשימת הציוד' : 'האירוע נוצר')
      onSaved?.(row.id)
      onClose()
    } else {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={event ? 'עריכת אירוע' : copyFrom ? `שכפול: ${copyFrom.name}` : 'אירוע חדש'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" form="event-form" className="btn btn-primary" disabled={saving}>
            {event ? 'שמירת שינויים' : 'יצירת אירוע'}
          </button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="שם האירוע" className="col-span-2">
          <input className="input" required autoFocus={!event} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="למשל: החתונה של נועה ואיתי" />
        </Field>
        <Field label="יוצא מהמחסן בתאריך">
          <input className="input" type="date" required value={form.event_date} onChange={(e) => setEventDate(e.target.value)} />
        </Field>
        <Field label="חוזר למחסן בתאריך">
          <input className="input" type="date" required min={form.event_date} value={form.return_date} onChange={(e) => set('return_date', e.target.value)} />
        </Field>
        <Field label="מקום האירוע" className="col-span-2">
          <input className="input" value={form.venue} onChange={(e) => set('venue', e.target.value)} />
        </Field>
        <Field label="איש קשר">
          <input className="input" value={form.client_name} onChange={(e) => set('client_name', e.target.value)} />
        </Field>
        <Field label="טלפון">
          <input className="input" type="tel" dir="ltr" value={form.client_phone} onChange={(e) => set('client_phone', e.target.value)} />
        </Field>
        <Field label="הערות" className="col-span-2">
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
