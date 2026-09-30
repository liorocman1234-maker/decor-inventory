import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { EmptyState, Field, LinkTabs, Modal, PageHeader } from '../components/ui'
import { del, ins, newRow, upd } from '../lib/db'
import { useStore } from '../lib/store'
import type { Supplier } from '../lib/types'
import { SUPPLIER_TABS } from './Shopping'

export default function Suppliers() {
  const { db, commit, notify } = useStore()
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null)

  const itemCount = (supplierId: string) => db.items.filter((i) => i.supplier_id === supplierId && !i.archived).length

  async function remove(supplier: Supplier) {
    if (!confirm(`למחוק את הספק "${supplier.name}"? הפריטים שלו יישארו במלאי בלי ספק.`)) return
    if (await commit([del('suppliers', supplier.id)])) notify('הספק נמחק')
  }

  return (
    <>
      <PageHeader title="ספקים ורכש" subtitle="ממי קונים כל פריט, ואיך יוצרים קשר">
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} />
          ספק חדש
        </button>
      </PageHeader>
      <LinkTabs tabs={SUPPLIER_TABS} />

      {db.suppliers.length === 0 ? (
        <EmptyState title="עדיין אין ספקים" hint="ספק שמוסיפים כאן אפשר לשייך לפריטים, כדי לדעת ממי להזמין כשהמלאי יורד.">
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            הוספת ספק
          </button>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {db.suppliers
            .toSorted((a, b) => a.name.localeCompare(b.name, 'he'))
            .map((s) => (
              <li key={s.id} className="card flex flex-col gap-1 p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-lg font-bold">{s.name}</p>
                  <div className="flex shrink-0">
                    <button className="btn btn-ghost btn-sm px-2" aria-label={`עריכת ${s.name}`} onClick={() => setEditing(s)}>
                      <Pencil size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm px-2 text-wine" aria-label={`מחיקת ${s.name}`} onClick={() => void remove(s)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {s.contact_name ? <p>{s.contact_name}</p> : null}
                {s.phone ? (
                  <a href={`tel:${s.phone}`} dir="ltr" className="self-start underline underline-offset-2">
                    {s.phone}
                  </a>
                ) : null}
                {s.email ? (
                  <a href={`mailto:${s.email}`} dir="ltr" className="self-start underline underline-offset-2">
                    {s.email}
                  </a>
                ) : null}
                {s.notes ? <p className="whitespace-pre-line text-ink-soft">{s.notes}</p> : null}
                <p className="mt-auto pt-2 text-xs text-muted">{itemCount(s.id)} פריטים במלאי</p>
              </li>
            ))}
        </ul>
      )}

      {editing ? <SupplierForm supplier={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </>
  )
}

function SupplierForm({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const { commit, notify } = useStore()
  const [form, setForm] = useState(() => ({
    name: supplier?.name ?? '',
    contact_name: supplier?.contact_name ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    notes: supplier?.notes ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const data = { ...form, name: form.name.trim() }
    const op = supplier ? upd('suppliers', supplier.id, data) : ins('suppliers', newRow(data))
    if (await commit([op])) {
      notify(supplier ? 'הספק עודכן' : 'הספק נוסף')
      onClose()
    } else {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={supplier ? 'עריכת ספק' : 'ספק חדש'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" form="supplier-form" className="btn btn-primary" disabled={saving}>
            {supplier ? 'שמירת שינויים' : 'הוספת ספק'}
          </button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="שם הספק" className="col-span-2">
          <input className="input" required autoFocus={!supplier} value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="איש קשר">
          <input className="input" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
        </Field>
        <Field label="טלפון">
          <input className="input" type="tel" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="אימייל" className="col-span-2">
          <input className="input" type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="הערות" className="col-span-2">
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
