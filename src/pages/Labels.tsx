import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Printer } from 'lucide-react'
import { PageHeader } from '../components/ui'
import { useStore } from '../lib/store'

/** The address a phone camera opens when it scans an item's label. */
const itemUrl = (itemId: string) => `${location.origin}${location.pathname}#/inventory/${itemId}`

function QrImage({ value }: { value: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let cancelled = false
    // Loaded on demand: only the labels page needs the QR generator.
    void import('qrcode').then((qr) => qr.toDataURL(value, { margin: 0, width: 240, errorCorrectionLevel: 'M' })).then((url) => !cancelled && setSrc(url))
    return () => {
      cancelled = true
    }
  }, [value])
  return src ? <img src={src} alt="" className="size-24" /> : <div className="size-24 bg-paper" />
}

export default function Labels() {
  const { db } = useStore()
  const [params, setParams] = useSearchParams()
  const only = params.get('item')
  const categoryId = params.get('category') ?? ''

  const items = db.items
    .filter((i) => (only ? i.id === only : !i.archived && (!categoryId || i.category_id === categoryId)))
    // By shelf, so labels print in the order they are stuck on; items without a location go last.
    .toSorted((a, b) => Number(!a.location) - Number(!b.location) || a.location.localeCompare(b.location, 'he') || a.name.localeCompare(b.name, 'he'))
  const local = ['localhost', '127.0.0.1'].includes(location.hostname)

  return (
    <>
      <Link to="/inventory" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ChevronRight size={16} />
        חזרה למלאי
      </Link>
      <PageHeader title="מדבקות QR" subtitle="מדביקים על המדף או הארגז. סריקה במצלמת הטלפון פותחת את עמוד הפריט.">
        {only ? (
          <button className="btn btn-secondary" onClick={() => setParams({})}>
            כל הפריטים
          </button>
        ) : (
          <select className="input w-44" aria-label="קטגוריה" value={categoryId} onChange={(e) => setParams(e.target.value ? { category: e.target.value } : {})}>
            <option value="">כל הקטגוריות</option>
            {db.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={16} />
          הדפסה ({items.length})
        </button>
      </PageHeader>

      {local ? (
        <p className="no-print mb-4 rounded-lg bg-brass-soft px-4 py-3 text-sm">
          המערכת רצה כרגע על המחשב הזה, ולכן טלפון לא יוכל לפתוח את הקישור שבמדבקה. מדפיסים מדבקות מהאתר שעלה ל-GitHub.
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2 print:gap-2">
        {items.map((item) => (
          <li key={item.id} className="card flex break-inside-avoid items-center gap-4 p-3 print:rounded-none">
            <QrImage value={itemUrl(item.id)} />
            <div className="min-w-0">
              <p className="font-display text-lg leading-tight font-bold">{item.name}</p>
              {item.location ? <p className="mt-1 text-sm">{item.location}</p> : null}
              <p className="mt-1 text-xs text-muted">{db.categories.find((c) => c.id === item.category_id)?.name}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
