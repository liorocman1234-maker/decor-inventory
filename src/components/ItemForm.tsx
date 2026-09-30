import { useState, type FormEvent } from 'react'
import { ImagePlus, Plus, Trash2 } from 'lucide-react'
import { del, ins, newRow, upd, type Op } from '../lib/db'
import { SPINE_COLORS, TRACKING_LABELS } from '../lib/format'
import { movementOp } from '../lib/stock'
import { useStore } from '../lib/store'
import type { Item, Tracking } from '../lib/types'
import { Field, Modal, MoneyInput, NumberInput } from './ui'

const NEW_CATEGORY = '__new__'

interface VariantDraft {
  /** Set for variants that already exist in the database. */
  id?: string
  key: string
  name: string
  sku: string
  /** Opening quantity; only asked for new variants. */
  quantity: number
}

const blankVariant = (): VariantDraft => ({ key: crypto.randomUUID(), name: '', sku: '', quantity: 0 })

export default function ItemForm({ item, onClose, onSaved }: { item?: Item; onClose: () => void; onSaved?: (id: string) => void }) {
  const { db, stock, user, commit, uploadImage, notify } = useStore()

  const [form, setForm] = useState(() => ({
    name: item?.name ?? '',
    category_id: item?.category_id ?? '',
    supplier_id: item?.supplier_id ?? '',
    tracking: item?.tracking ?? ('reusable' as Tracking),
    location: item?.location ?? '',
    description: item?.description ?? '',
    image_url: item?.image_url ?? null,
    cost_price: item?.cost_price ?? 0,
    sale_price: item?.sale_price ?? 0,
    min_quantity: item?.min_quantity ?? 0,
    buffer_days: item?.buffer_days ?? 0,
    custom_values: item?.custom_values ?? {},
  }))
  const [newCategory, setNewCategory] = useState('')
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    item ? stock.variantsOf(item.id).map((v) => ({ id: v.id, key: v.id, name: v.name, sku: v.sku, quantity: 0 })) : [blankVariant()],
  )
  const [hasVariants, setHasVariants] = useState(() => variants.length > 1 || variants[0]?.name !== '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setVariant = (key: string, patch: Partial<VariantDraft>) =>
    setVariants((list) => list.map((v) => (v.key === key ? { ...v, ...patch } : v)))

  async function pickImage(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      set('image_url', await uploadImage(file))
    } catch {
      notify('העלאת התמונה נכשלה. אפשר לנסות שוב או לבחור תמונה אחרת.', 'error')
    }
    setUploading(false)
  }

  function removeVariant(draft: VariantDraft) {
    if (draft.id && stock.linesOfVariant(draft.id).length > 0) {
      return notify('הווריאנט הזה משויך לאירועים ולכן אי אפשר למחוק אותו.', 'error')
    }
    setVariants((list) => list.filter((v) => v.key !== draft.key))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const drafts = hasVariants ? variants : [{ ...variants[0], name: '' }]
    if (hasVariants && drafts.some((v) => !v.name.trim())) {
      return notify('לכל וריאנט צריך שם, למשל צבע או מידה.', 'error')
    }

    setSaving(true)
    const ops: Op[] = []

    let category_id: string | null = form.category_id || null
    if (form.category_id === NEW_CATEGORY) {
      const category = newRow({ name: newCategory.trim() || 'קטגוריה חדשה', color: SPINE_COLORS[db.categories.length % SPINE_COLORS.length] })
      ops.push(ins('categories', category))
      category_id = category.id
    }

    const data = {
      ...form,
      name: form.name.trim(),
      category_id,
      supplier_id: form.supplier_id || null,
      buffer_days: form.tracking === 'reusable' ? form.buffer_days : 0,
    }
    const itemId = item?.id ?? crypto.randomUUID()
    if (item) ops.push(upd('items', item.id, data))
    else ops.push(ins('items', { ...newRow(data), id: itemId, archived: false }))

    for (const draft of drafts) {
      const name = draft.name.trim()
      const sku = draft.sku.trim()
      if (draft.id) {
        ops.push(upd('variants', draft.id, { name, sku }))
        continue
      }
      const variant = newRow({ item_id: itemId, name, sku })
      ops.push(ins('variants', variant))
      if (draft.quantity > 0) {
        ops.push(movementOp(variant.id, 'purchase', draft.quantity, { unitPrice: form.cost_price, note: 'מלאי פתיחה', user }))
      }
    }
    if (item) {
      const kept = new Set(drafts.map((d) => d.id))
      for (const v of stock.variantsOf(item.id)) if (!kept.has(v.id)) ops.push(del('variants', v.id))
    }

    if (await commit(ops)) {
      notify(item ? 'הפריט עודכן' : 'הפריט נוסף למלאי')
      onSaved?.(itemId)
      onClose()
    } else {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide
      title={item ? 'עריכת פריט' : 'פריט חדש'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" form="item-form" className="btn btn-primary" disabled={saving || uploading}>
            {item ? 'שמירת שינויים' : 'הוספה למלאי'}
          </button>
        </>
      }
    >
      <form id="item-form" onSubmit={submit} className="space-y-5">
        <div className="flex gap-4">
          <label className="relative grid size-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-paper text-muted hover:border-ink/40">
            {form.image_url ? (
              <img src={form.image_url} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-[11px]">
                <ImagePlus size={20} />
                {uploading ? 'מעלה...' : 'תמונה'}
              </span>
            )}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pickImage(e.target.files?.[0])} />
          </label>
          <div className="flex-1 space-y-3">
            <Field label="שם הפריט">
              <input className="input" required autoFocus={!item} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="למשל: פמוט פליז" />
            </Field>
            <Field label="קטגוריה">
              <select className="input" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                <option value="">ללא קטגוריה</option>
                {db.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={NEW_CATEGORY}>+ קטגוריה חדשה</option>
              </select>
            </Field>
            {form.category_id === NEW_CATEGORY ? (
              <input className="input" required value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="שם הקטגוריה החדשה" aria-label="שם הקטגוריה החדשה" />
            ) : null}
          </div>
        </div>

        <fieldset>
          <legend className="label">מה קורה לפריט באירוע</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['reusable', 'consumable'] as const).map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${form.tracking === t ? 'border-ink bg-ink/5 font-medium' : 'border-line'}`}
              >
                <input type="radio" name="tracking" className="sr-only" checked={form.tracking === t} onChange={() => set('tracking', t)} />
                {TRACKING_LABELS[t]}
                <span className="block text-xs font-normal text-muted">
                  {t === 'reusable' ? 'יוצא וחוזר למחסן' : 'נגמר או נמכר, כמו נרות'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-ink" checked={hasVariants} disabled={hasVariants && variants.length > 1} onChange={(e) => setHasVariants(e.target.checked)} />
            לפריט יש כמה וריאנטים (צבעים, מידות)
          </label>
          {hasVariants ? (
            <div className="space-y-2">
              {variants.map((v) => (
                <div key={v.key} className="flex items-end gap-2">
                  <Field label="וריאנט" className="flex-1">
                    <input className="input" value={v.name} onChange={(e) => setVariant(v.key, { name: e.target.value })} placeholder="למשל: בורדו" />
                  </Field>
                  <Field label="מק״ט" className="w-24">
                    <input className="input" dir="ltr" value={v.sku} onChange={(e) => setVariant(v.key, { sku: e.target.value })} />
                  </Field>
                  <Field label="כמות" className="w-20">
                    {v.id ? (
                      <p className="input flex items-center justify-center bg-paper text-muted">{stock.owned(v.id)}</p>
                    ) : (
                      <NumberInput value={v.quantity} onChange={(quantity) => setVariant(v.key, { quantity })} />
                    )}
                  </Field>
                  <button type="button" aria-label="מחיקת וריאנט" className="btn btn-ghost px-2" disabled={variants.length === 1} onClick={() => removeVariant(v)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVariants((list) => [...list, blankVariant()])}>
                <Plus size={14} />
                וריאנט נוסף
              </button>
            </div>
          ) : variants[0]?.id ? null : (
            <Field label="כמות התחלתית במלאי" className="w-40">
              <NumberInput value={variants[0].quantity} onChange={(quantity) => setVariant(variants[0].key, { quantity })} />
            </Field>
          )}
          {item ? <p className="mt-2 text-xs text-muted">כמויות של פריט קיים מעדכנים בכפתור "עדכון מלאי" בעמוד הפריט.</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="עלות ליחידה (₪)">
            <MoneyInput value={form.cost_price} onChange={(n) => set('cost_price', n)} />
          </Field>
          <Field label="מחיר מכירה (₪)">
            <MoneyInput value={form.sale_price} onChange={(n) => set('sale_price', n)} />
          </Field>
          <Field label="התראת מלאי נמוך מתחת ל">
            <NumberInput value={form.min_quantity} onChange={(n) => set('min_quantity', n)} />
          </Field>
          {form.tracking === 'reusable' ? (
            <Field label="ימי ניקוי אחרי אירוע">
              <NumberInput value={form.buffer_days} onChange={(n) => set('buffer_days', n)} max={30} />
            </Field>
          ) : null}
          <Field label="מיקום במחסן">
            <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="מדף, ארגז" />
          </Field>
          <Field label="ספק" className={form.tracking === 'reusable' ? '' : 'col-span-2'}>
            <select className="input" value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
              <option value="">ללא ספק</option>
              {db.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {db.custom_fields.length ? (
          <div className="grid grid-cols-2 gap-3">
            {db.custom_fields.map((field) => {
              const value = form.custom_values[field.id] ?? ''
              const change = (v: string) => set('custom_values', { ...form.custom_values, [field.id]: v })
              return (
                <Field key={field.id} label={field.name}>
                  {field.field_type === 'select' ? (
                    <select className="input" value={value} onChange={(e) => change(e.target.value)}>
                      <option value=""></option>
                      {field.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="input" type={field.field_type === 'number' ? 'number' : 'text'} value={value} onChange={(e) => change(e.target.value)} />
                  )}
                </Field>
              )
            })}
          </div>
        ) : null}

        <Field label="הערות">
          <textarea className="input" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
