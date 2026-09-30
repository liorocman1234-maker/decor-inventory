import { useDeferredValue, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Plus, QrCode, Search } from 'lucide-react'
import ImportModal from '../components/ImportModal'
import ItemForm from '../components/ItemForm'
import { Badge, EmptyState, LinkTabs, PageHeader } from '../components/ui'
import { INVENTORY_TABS } from './Kits'
import { fmtDate, NO_CATEGORY_COLOR, TRACKING_LABELS } from '../lib/format'
import { isLowStock } from '../lib/stock'
import { useStore } from '../lib/store'

export default function Inventory() {
  const { db, stock } = useStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [onDate, setOnDate] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const search = useDeferredValue(query).trim().toLowerCase()

  const categoryById = useMemo(() => new Map(db.categories.map((c) => [c.id, c])), [db.categories])
  const hasArchived = db.items.some((i) => i.archived)

  const items = useMemo(
    () =>
      db.items
        .filter((item) => {
          if (item.archived !== showArchived) return false
          if (categoryId && item.category_id !== categoryId) return false
          if (!search) return true
          const haystack = [item.name, item.location, ...stock.variantsOf(item.id).flatMap((v) => [v.name, v.sku])]
          return haystack.some((text) => text.toLowerCase().includes(search))
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [db.items, stock, showArchived, categoryId, search],
  )

  return (
    <>
      <PageHeader title="מלאי" subtitle={`${db.items.filter((i) => !i.archived).length} סוגי פריטים`}>
        <button className="btn btn-secondary" onClick={() => setImporting(true)}>
          <FileSpreadsheet size={16} />
          ייבוא מאקסל
        </button>
        <Link to="/labels" className="btn btn-secondary">
          <QrCode size={16} />
          מדבקות QR
        </Link>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} />
          פריט חדש
        </button>
      </PageHeader>
      <LinkTabs tabs={INVENTORY_TABS} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="relative min-w-52 flex-1">
          <span className="sr-only">חיפוש</span>
          <Search size={16} className="pointer-events-none absolute start-3 top-3 text-muted" />
          <input className="input ps-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם, וריאנט, מק״ט או מיקום" />
        </label>
        <label className="text-xs text-ink-soft">
          <span className="label">זמינות בתאריך</span>
          <input type="date" className="input w-44" value={onDate} onChange={(e) => setOnDate(e.target.value)} />
        </label>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Chip active={!categoryId} onClick={() => setCategoryId('')}>
          הכול
        </Chip>
        {db.categories.map((c) => (
          <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} color={c.color}>
            {c.name}
          </Chip>
        ))}
        {hasArchived ? (
          <Chip active={showArchived} onClick={() => setShowArchived((v) => !v)}>
            ארכיון
          </Chip>
        ) : null}
      </div>

      {onDate ? (
        <p className="mb-3 text-sm text-ink-soft">
          מוצגת הכמות הפנויה ב-{fmtDate(onDate)}, אחרי הורדת מה שמשוריין לאירועים באותו יום.
        </p>
      ) : null}

      {items.length === 0 ? (
        db.items.length === 0 ? (
          <EmptyState title="המלאי עדיין ריק" hint="מוסיפים את הפריט הראשון, ומשם אפשר לשייך אותו לאירועים ולעקוב אחרי הכמויות.">
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                הוספת פריט ראשון
              </button>
              <button className="btn btn-secondary" onClick={() => setImporting(true)}>
                ייבוא מאקסל
              </button>
            </div>
          </EmptyState>
        ) : (
          <EmptyState title="לא נמצאו פריטים" hint="אפשר לנסות חיפוש אחר או לבחור קטגוריה אחרת." />
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const category = item.category_id ? categoryById.get(item.category_id) : undefined
            const owned = stock.itemOwned(item.id)
            const shown = onDate ? stock.itemAvailable(item.id, onDate, onDate) : stock.itemInHouse(item.id)
            const variants = stock.variantsOf(item.id)
            return (
              <li key={item.id}>
                <Link
                  to={`/inventory/${item.id}`}
                  className="card spine flex h-full items-center gap-3 transition-colors hover:border-ink/30"
                  style={{ '--spine': category?.color ?? NO_CATEGORY_COLOR } as CSSProperties}
                >
                  <div className="my-3 ms-3 grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-paper">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <span aria-hidden className="font-display text-2xl text-muted/50">{item.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 py-3">
                    <p className="line-clamp-2 leading-snug font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted">
                      {[category?.name, variants.length > 1 ? `${variants.length} וריאנטים` : '', item.location].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.tracking === 'consumable' ? <Badge>{TRACKING_LABELS.consumable}</Badge> : null}
                      {isLowStock(item, stock) ? <Badge tone="brass">מלאי נמוך</Badge> : null}
                      {shown < 0 ? <Badge tone="wine">חוסר</Badge> : null}
                    </div>
                  </div>
                  <div className="shrink-0 pe-4 text-center">
                    <p className={`font-display text-2xl leading-none font-bold ${shown < 0 ? 'text-wine' : ''}`}>{shown}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {onDate ? 'פנויות' : 'במחסן'} מתוך {owned}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {importing ? <ImportModal onClose={() => setImporting(false)} /> : null}
      {adding ? <ItemForm onClose={() => setAdding(false)} onSaved={(id) => navigate(`/inventory/${id}`)} /> : null}
    </>
  )
}

function Chip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors ${
        active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-soft hover:border-ink/40'
      }`}
    >
      {color ? <span className="size-2.5 rounded-full" style={{ background: color }} /> : null}
      {children}
    </button>
  )
}
