import { useRef, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PageHeader, Section } from '../components/ui'
import { del, emptyDb, ins, newRow, TABLES, upd } from '../lib/db'
import { SPINE_COLORS, todayISO, TRACKING_LABELS } from '../lib/format'
import { seedDb } from '../lib/seed'
import { useStore } from '../lib/store'
import type { DB, FieldType } from '../lib/types'

// Byte-order mark: makes Excel read the CSV as UTF-8, so the Hebrew shows correctly.
const BOM = String.fromCharCode(0xfeff)

const FIELD_TYPES: Record<FieldType, string> = { text: 'טקסט', number: 'מספר', select: 'בחירה מרשימה' }

export default function Settings() {
  const { db, stock, mode, user, commit, replaceAll, signOut, notify } = useStore()
  const [categoryName, setCategoryName] = useState('')
  const [field, setField] = useState({ name: '', field_type: 'text' as FieldType, options: '' })
  const fileInput = useRef<HTMLInputElement>(null)

  async function addCategory(e: FormEvent) {
    e.preventDefault()
    const name = categoryName.trim()
    if (!name) return
    const color = SPINE_COLORS[db.categories.length % SPINE_COLORS.length]
    if (await commit([ins('categories', newRow({ name, color }))])) setCategoryName('')
  }

  async function removeCategory(id: string, name: string) {
    const count = db.items.filter((i) => i.category_id === id).length
    if (count && !confirm(`בקטגוריה "${name}" יש ${count} פריטים. הם יישארו במלאי בלי קטגוריה. למחוק?`)) return
    await commit([del('categories', id)])
  }

  async function addField(e: FormEvent) {
    e.preventDefault()
    const name = field.name.trim()
    if (!name) return
    const options = field.field_type === 'select' ? field.options.split(',').map((o) => o.trim()).filter(Boolean) : []
    if (field.field_type === 'select' && options.length === 0) return notify('לשדה בחירה צריך לפחות אפשרות אחת, מופרדות בפסיקים.', 'error')
    if (await commit([ins('custom_fields', newRow({ name, field_type: field.field_type, options }))])) {
      setField({ name: '', field_type: 'text', options: '' })
    }
  }

  async function removeField(id: string, name: string) {
    if (!confirm(`למחוק את השדה "${name}"? הערכים שהוזנו בו לא יוצגו יותר.`)) return
    await commit([del('custom_fields', id)])
  }

  function exportBackup() {
    download(`inventory-backup-${todayISO()}.json`, JSON.stringify(db, null, 2), 'application/json')
  }

  function exportCsv() {
    const header = ['פריט', 'וריאנט', 'מק״ט', 'קטגוריה', 'סוג', 'מיקום', 'בבעלות', 'בחוץ', 'במחסן', 'עלות ליחידה', 'מחיר מכירה']
    const rows = db.variants.map((v) => {
      const item = stock.itemById.get(v.item_id)!
      return [
        item.name,
        v.name,
        v.sku,
        db.categories.find((c) => c.id === item.category_id)?.name ?? '',
        TRACKING_LABELS[item.tracking],
        item.location,
        stock.owned(v.id),
        stock.out(v.id),
        stock.inHouse(v.id),
        item.cost_price,
        item.sale_price,
      ]
    })
    const csv = [header, ...rows].map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    // The BOM makes Excel read the Hebrew as UTF-8.
    download(`inventory-${todayISO()}.csv`, BOM + csv, 'text/csv')
  }

  async function importBackup(file: File | undefined) {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as Partial<DB>
      if (!TABLES.every((t) => Array.isArray(parsed[t]))) throw new Error('not a backup file')
      if (!confirm('הייבוא יחליף את כל הנתונים שבדפדפן הזה בנתונים מהקובץ. להמשיך?')) return
      await replaceAll(parsed as DB)
      notify('הנתונים יובאו מהקובץ')
    } catch {
      notify('הקובץ אינו גיבוי תקין של המערכת.', 'error')
    }
  }

  async function reset(next: DB, question: string, done: string) {
    if (!confirm(question)) return
    await replaceAll(next)
    notify(done)
  }

  return (
    <>
      <PageHeader title="הגדרות" subtitle="קטגוריות, שדות משלכן וגיבוי" />

      <Section title="קטגוריות">
        <div className="card divide-y divide-line">
          {db.categories.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              <div className="flex w-full gap-1 sm:w-auto">
                {SPINE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`צבע ${color}`}
                    aria-pressed={c.color === color}
                    onClick={() => void commit([upd('categories', c.id, { color })])}
                    className={`h-6 w-3 cursor-pointer rounded-sm ${c.color === color ? 'ring-2 ring-ink ring-offset-1' : 'opacity-35 hover:opacity-100'}`}
                    style={{ background: color }}
                  />
                ))}
              </div>
              <input
                className="input min-w-0 flex-1"
                key={c.name}
                aria-label="שם הקטגוריה"
                defaultValue={c.name}
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name && name !== c.name) void commit([upd('categories', c.id, { name })])
                  else e.target.value = c.name
                }}
              />
              <button className="btn btn-ghost px-2 text-wine" aria-label={`מחיקת ${c.name}`} onClick={() => void removeCategory(c.id, c.name)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <form onSubmit={addCategory} className="flex gap-2 px-4 py-3">
            <input className="input flex-1" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="קטגוריה חדשה, למשל: מראות" aria-label="שם קטגוריה חדשה" />
            <button className="btn btn-secondary" disabled={!categoryName.trim()}>
              <Plus size={16} />
              הוספה
            </button>
          </form>
        </div>
      </Section>

      <Section title="שדות משלכן">
        <p className="mb-3 text-sm text-muted">שדה שמוסיפים כאן מופיע בכל פריט, למשל סגנון, מידות או חומר.</p>
        <div className="card divide-y divide-line">
          {db.custom_fields.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1">
                <span className="font-medium">{f.name}</span>
                <span className="block text-xs text-muted">
                  {FIELD_TYPES[f.field_type]}
                  {f.options.length ? `: ${f.options.join(', ')}` : ''}
                </span>
              </span>
              <button className="btn btn-ghost px-2 text-wine" aria-label={`מחיקת ${f.name}`} onClick={() => void removeField(f.id, f.name)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <form onSubmit={addField} className="flex flex-wrap gap-2 px-4 py-3">
            <input className="input min-w-40 flex-1" value={field.name} onChange={(e) => setField({ ...field, name: e.target.value })} placeholder="שם השדה" aria-label="שם השדה" />
            <select className="input w-40" aria-label="סוג השדה" value={field.field_type} onChange={(e) => setField({ ...field, field_type: e.target.value as FieldType })}>
              {Object.entries(FIELD_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {field.field_type === 'select' ? (
              <input className="input min-w-52 flex-1" value={field.options} onChange={(e) => setField({ ...field, options: e.target.value })} placeholder="אפשרויות, מופרדות בפסיקים" aria-label="אפשרויות" />
            ) : null}
            <button className="btn btn-secondary" disabled={!field.name.trim()}>
              <Plus size={16} />
              הוספה
            </button>
          </form>
        </div>
      </Section>

      <Section title="גיבוי וייצוא">
        <div className="card flex flex-wrap items-center gap-2 p-4">
          <button className="btn btn-secondary" onClick={exportCsv}>
            ייצוא המלאי לאקסל (CSV)
          </button>
          <button className="btn btn-secondary" onClick={exportBackup}>
            הורדת גיבוי מלא
          </button>
          {mode === 'local' ? (
            <>
              <button className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
                ייבוא מגיבוי
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json"
                className="sr-only"
                onChange={(e) => {
                  void importBackup(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </>
          ) : null}
        </div>
      </Section>

      <Section title="חיבור">
        {mode === 'cloud' ? (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <p>
              מחוברים לענן בתור <span dir="ltr" className="font-medium">{user}</span>. הנתונים מסונכרנים בין כל המכשירים.
            </p>
            <button className="btn btn-secondary" onClick={() => void signOut()}>
              התנתקות
            </button>
          </div>
        ) : (
          <div className="card space-y-3 p-4 text-sm">
            <p>
              <b className="font-medium">מצב הדגמה.</b> הנתונים נשמרים בדפדפן הזה בלבד ולא מסונכרנים בין מכשירים. אחרי חיבור ל-Supabase לפי
              ההוראות בקובץ README כולן יעבדו על אותו מלאי.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => void reset(seedDb(todayISO()), 'לטעון מחדש את נתוני הדוגמה? הנתונים הנוכחיים בדפדפן יוחלפו.', 'נתוני הדוגמה נטענו')}
              >
                טעינת נתוני דוגמה
              </button>
              <button
                className="btn btn-ghost text-wine"
                onClick={() => void reset(emptyDb(), 'למחוק את כל הנתונים שבדפדפן הזה ולהתחיל ממלאי ריק?', 'כל הנתונים נמחקו')}
              >
                התחלה ממלאי ריק
              </button>
            </div>
          </div>
        )}
      </Section>

    </>
  )
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
