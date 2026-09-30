import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import MovementList from '../components/MovementList'
import { PageHeader, Section } from '../components/ui'
import { addDays, fmtMoney, MOVEMENT_LABELS, todayISO } from '../lib/format'
import { useStore } from '../lib/store'
import type { MovementKind } from '../lib/types'

const PERIODS = [
  { days: 30, label: '30 הימים האחרונים' },
  { days: 90, label: '3 החודשים האחרונים' },
  { days: 365, label: 'השנה האחרונה' },
  { days: 0, label: 'כל הזמן' },
]

export default function Reports() {
  const { db, stock } = useStore()
  const [days, setDays] = useState(90)
  const [kind, setKind] = useState<MovementKind | ''>('')

  const report = useMemo(() => {
    const since = days ? addDays(todayISO(), -days) : ''
    const movements = db.movements.filter((m) => m.created_at.slice(0, 10) >= since)

    const totals = { purchase: sum(), sold: sum(), damaged: sum(), lost: sum(), consumed: sum() }
    for (const m of movements) {
      if (m.kind === 'adjust') continue
      const bucket = totals[m.kind]
      bucket.units += Math.abs(m.quantity)
      bucket.value += Math.abs(m.quantity) * m.unit_price
    }

    const demand = new Map<string, { events: Set<string>; units: number }>()
    for (const line of db.event_items) {
      const event = stock.eventById.get(line.event_id)
      const item = stock.itemOf(line.variant_id)
      if (!event || !item || event.event_date < since) continue
      const entry = demand.get(item.id) ?? { events: new Set(), units: 0 }
      entry.events.add(event.id)
      entry.units += line.quantity
      demand.set(item.id, entry)
    }
    const popular = [...demand]
      .map(([itemId, d]) => ({ item: stock.itemById.get(itemId)!, events: d.events.size, units: d.units }))
      .sort((a, b) => b.events - a.events || b.units - a.units)
      .slice(0, 8)

    const byCategory = new Map<string, { name: string; items: number; units: number; value: number }>()
    for (const item of db.items) {
      if (item.archived) continue
      const key = item.category_id ?? ''
      const row = byCategory.get(key) ?? { name: db.categories.find((c) => c.id === key)?.name ?? 'ללא קטגוריה', items: 0, units: 0, value: 0 }
      const owned = stock.itemOwned(item.id)
      row.items++
      row.units += owned
      row.value += owned * item.cost_price
      byCategory.set(key, row)
    }
    const categories = [...byCategory.values()].sort((a, b) => b.value - a.value)

    return { movements, totals, popular, categories, stockValue: categories.reduce((total, c) => total + c.value, 0) }
  }, [db, stock, days])

  const { totals } = report
  const log = kind ? report.movements.filter((m) => m.kind === kind) : report.movements

  return (
    <>
      <PageHeader title="דוחות" subtitle="רכישות, מכירות ופחת, ומה הכי מבוקש באירועים">
        <select className="input w-52" aria-label="תקופה" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </select>
      </PageHeader>

      <Section title="כסף ופחת בתקופה">
        <dl className="card grid grid-cols-2 divide-line max-sm:divide-y sm:grid-cols-4 sm:divide-x">
          <Figure label="רכישות" value={fmtMoney(totals.purchase.value)} note={`${totals.purchase.units} יח׳ נוספו`} />
          <Figure label="הכנסות ממכירה" value={fmtMoney(totals.sold.value)} note={`${totals.sold.units} יח׳ נמכרו`} />
          <Figure
            label="נשבר ואבד"
            value={fmtMoney(totals.damaged.value + totals.lost.value)}
            note={`${totals.damaged.units} נשברו, ${totals.lost.units} אבדו`}
          />
          <Figure label="נצרך" value={fmtMoney(totals.consumed.value)} note={`${totals.consumed.units} יח׳ לפי עלות`} />
        </dl>
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="הכי מבוקשים באירועים">
          {report.popular.length ? (
            <Table head={['פריט', 'אירועים', 'יח׳']}>
              {report.popular.map(({ item, events, units }) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5">
                    <Link to={`/inventory/${item.id}`} className="hover:underline">
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-center">{events}</td>
                  <td className="px-3 py-2.5 text-center">{units}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="card px-4 py-5 text-center text-sm text-muted">אין אירועים בתקופה הזו.</p>
          )}
        </Section>

        <Section title={`שווי המלאי היום: ${fmtMoney(report.stockValue)}`}>
          <Table head={['קטגוריה', 'פריטים', 'יח׳', 'שווי']}>
            {report.categories.map((c) => (
              <tr key={c.name}>
                <td className="px-4 py-2.5">{c.name}</td>
                <td className="px-3 py-2.5 text-center">{c.items}</td>
                <td className="px-3 py-2.5 text-center">{c.units}</td>
                <td className="px-3 py-2.5 text-center">{fmtMoney(c.value)}</td>
              </tr>
            ))}
          </Table>
        </Section>
      </div>

      <Section
        title="יומן תנועות"
        action={
          <select className="input w-40" aria-label="סוג תנועה" value={kind} onChange={(e) => setKind(e.target.value as MovementKind | '')}>
            <option value="">כל הסוגים</option>
            {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        }
      >
        <MovementList movements={log} showVariant />
      </Section>
    </>
  )
}

const sum = () => ({ units: 0, value: 0 })

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
      <dd className="text-xs text-muted">{note}</dd>
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th key={h} className={`py-2.5 font-medium ${i === 0 ? 'px-4 text-start' : 'px-3'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}
