import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, ChevronRight, Pencil, QrCode, Trash2 } from 'lucide-react'
import ItemForm from '../components/ItemForm'
import MovementList from '../components/MovementList'
import StockActionModal from '../components/StockActionModal'
import { Badge, PageHeader, Section, StatusBadge } from '../components/ui'
import { del, upd } from '../lib/db'
import { fmtDate, fmtMoney, TRACKING_LABELS } from '../lib/format'
import { isLowStock } from '../lib/stock'
import { useStore } from '../lib/store'
import type { Variant } from '../lib/types'

export default function ItemDetail() {
  const { id = '' } = useParams()
  const { db, stock, commit, notify } = useStore()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [stockFor, setStockFor] = useState<Variant | null>(null)

  const item = stock.itemById.get(id)
  if (!item) return <Navigate to="/inventory" replace />

  const variants = stock.variantsOf(item.id)
  const variantIds = new Set(variants.map((v) => v.id))
  const category = db.categories.find((c) => c.id === item.category_id)
  const supplier = db.suppliers.find((s) => s.id === item.supplier_id)
  const movements = db.movements.filter((m) => variantIds.has(m.variant_id))
  const bookings = db.event_items
    .filter((l) => variantIds.has(l.variant_id))
    .map((line) => ({ line, event: stock.eventById.get(line.event_id)! }))
    .filter((b) => b.event && b.event.status !== 'closed')
    .sort((a, b) => a.event.event_date.localeCompare(b.event.event_date))

  const details: [string, string][] = [
    ['סוג', TRACKING_LABELS[item.tracking]],
    ['מיקום במחסן', item.location],
    ['ספק', supplier?.name ?? ''],
    ['עלות ליחידה', item.cost_price ? fmtMoney(item.cost_price) : ''],
    ['מחיר מכירה', item.sale_price ? fmtMoney(item.sale_price) : ''],
    ['התראת מלאי נמוך', item.min_quantity ? `מתחת ל-${item.min_quantity}` : ''],
    ['ימי ניקוי אחרי אירוע', item.buffer_days ? String(item.buffer_days) : ''],
    ...db.custom_fields.map((f): [string, string] => [f.name, item.custom_values[f.id] ?? '']),
  ]

  async function remove() {
    if (!confirm(`למחוק את "${item!.name}"? כל ההיסטוריה והשיוכים לאירועים של הפריט יימחקו. אם רוצים רק להסתיר אותו, עדיף להעביר לארכיון.`)) return
    if (await commit([del('items', item!.id)])) {
      notify('הפריט נמחק')
      navigate('/inventory')
    }
  }

  async function toggleArchive() {
    if (await commit([upd('items', item!.id, { archived: !item!.archived })])) {
      notify(item!.archived ? 'הפריט הוחזר מהארכיון' : 'הפריט הועבר לארכיון')
    }
  }

  return (
    <>
      <Link to="/inventory" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ChevronRight size={16} />
        חזרה למלאי
      </Link>

      <PageHeader title={item.name} subtitle={category?.name}>
        <button className="btn btn-secondary" onClick={() => setEditing(true)}>
          <Pencil size={15} />
          עריכה
        </button>
        <Link to={`/labels?item=${item.id}`} className="btn btn-secondary">
          <QrCode size={15} />
          מדבקת QR
        </Link>
        <button className="btn btn-secondary" onClick={() => void toggleArchive()}>
          {item.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          {item.archived ? 'החזרה מהארכיון' : 'לארכיון'}
        </button>
        <button className="btn btn-ghost px-2.5 text-wine" aria-label="מחיקת הפריט" onClick={() => void remove()}>
          <Trash2 size={16} />
        </button>
      </PageHeader>

      <div className="mb-8 flex flex-col gap-5 sm:flex-row">
        {item.image_url ? <img src={item.image_url} alt={item.name} className="size-40 shrink-0 rounded-xl border border-line object-cover" /> : null}
        <div className="flex-1">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {item.archived ? <Badge>בארכיון</Badge> : null}
            {isLowStock(item, stock) ? <Badge tone="brass">מלאי נמוך</Badge> : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {details
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          {item.description ? <p className="mt-3 text-sm whitespace-pre-line text-ink-soft">{item.description}</p> : null}
        </div>
      </div>

      <Section title="כמויות">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 text-start font-medium">{variants.length > 1 ? 'וריאנט' : 'פריט'}</th>
                <th className="px-3 py-2.5 font-medium">בבעלות</th>
                <th className="px-3 py-2.5 font-medium">בחוץ</th>
                <th className="px-3 py-2.5 font-medium">במחסן</th>
                <th className="no-print px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {variants.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2.5">
                    {v.name || item.name}
                    {v.sku ? <span className="ms-2 text-xs text-muted" dir="ltr">{v.sku}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-center">{stock.owned(v.id)}</td>
                  <td className="px-3 py-2.5 text-center">{stock.out(v.id)}</td>
                  <td className="px-3 py-2.5 text-center font-display text-lg font-bold">{stock.inHouse(v.id)}</td>
                  <td className="no-print px-4 py-2 text-end">
                    <button className="btn btn-secondary btn-sm" onClick={() => setStockFor(v)}>
                      עדכון מלאי
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="משוריין לאירועים">
        {bookings.length ? (
          <ul className="card divide-y divide-line text-sm">
            {bookings.map(({ line, event }) => (
              <li key={line.id}>
                <Link to={`/events/${event.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
                  <span className="flex-1">
                    {event.name}
                    <span className="block text-xs text-muted">
                      {fmtDate(event.event_date)}
                      {variants.length > 1 ? ` · ${stock.variantById.get(line.variant_id)?.name}` : ''}
                    </span>
                  </span>
                  <span className="font-medium">{line.quantity} יח׳</span>
                  <StatusBadge status={event.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card px-4 py-5 text-center text-sm text-muted">הפריט לא משויך כרגע לאף אירוע פתוח.</p>
        )}
      </Section>

      <Section title="היסטוריית מלאי">
        <MovementList movements={movements} showVariant={variants.length > 1} />
      </Section>

      {editing ? <ItemForm item={item} onClose={() => setEditing(false)} /> : null}
      {stockFor ? <StockActionModal item={item} variant={stockFor} onClose={() => setStockFor(null)} /> : null}
    </>
  )
}
