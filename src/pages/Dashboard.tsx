import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import EventRow from '../components/EventRow'
import { EmptyState, PageHeader, Section } from '../components/ui'
import { fmtDate, fmtMoney, relativeDay, todayISO } from '../lib/format'
import { findShortages, isLowStock } from '../lib/stock'
import { useStore } from '../lib/store'

export default function Dashboard() {
  const { db, stock } = useStore()
  const today = todayISO()

  const view = useMemo(() => {
    const open = db.events.filter((e) => e.status !== 'closed').sort((a, b) => a.event_date.localeCompare(b.event_date))
    const items = db.items.filter((i) => !i.archived)
    let owned = 0
    let out = 0
    let value = 0
    for (const item of items) {
      const itemOwned = stock.itemOwned(item.id)
      owned += itemOwned
      out += stock.itemOut(item.id)
      value += itemOwned * item.cost_price
    }
    return {
      upcoming: open.slice(0, 6),
      late: open.filter((e) => e.status === 'out' && e.return_date < today),
      low: items.filter((i) => isLowStock(i, stock)),
      shortages: findShortages(db, stock),
      totals: { items: items.length, owned, out, value },
    }
  }, [db, stock, today])

  const attention = view.late.length + view.low.length + view.shortages.length

  return (
    <>
      <PageHeader title="לוח בקרה" subtitle={fmtDate(today)} />

      <div className="grid gap-x-8 lg:grid-cols-[3fr_2fr]">
        <Section
          title="האירועים הקרובים"
          action={
            <Link to="/events" className="text-sm text-ink-soft underline underline-offset-4">
              לכל האירועים
            </Link>
          }
        >
          {view.upcoming.length ? (
            <div className="space-y-2">
              {view.upcoming.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          ) : (
            <EmptyState title="אין אירועים פתוחים" hint="אירוע חדש משריין ציוד לתאריך ומראה מה נשאר זמין.">
              <Link to="/events" className="btn btn-primary">
                לעמוד האירועים
              </Link>
            </EmptyState>
          )}
        </Section>

        <Section title={attention ? `דורש טיפול (${attention})` : 'דורש טיפול'}>
          {attention === 0 ? (
            <div className="card px-4 py-6 text-center text-sm text-muted">הכול מסודר. אין חוסרים, איחורים או מלאי נמוך.</div>
          ) : (
            <ul className="card divide-y divide-line text-sm">
              {view.late.map((e) => (
                <li key={e.id}>
                  <Link to={`/events/${e.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-paper">
                    <Dot className="bg-wine" />
                    <span>
                      <b className="font-medium">ציוד שלא חזר:</b> {e.name}
                      <span className="block text-xs text-muted">היה אמור לחזור {relativeDay(e.return_date)}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {view.shortages.map(({ event, line, missing }) => (
                <li key={line.id}>
                  <Link to={`/events/${event.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-paper">
                    <Dot className="bg-wine" />
                    <span>
                      <b className="font-medium">חסרות {missing} יח׳:</b> {stock.label(line.variant_id)}
                      <span className="block text-xs text-muted">
                        {event.name}, {fmtDate(event.event_date)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              {view.low.map((item) => (
                <li key={item.id}>
                  <Link to={`/inventory/${item.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-paper">
                    <Dot className="bg-brass" />
                    <span>
                      <b className="font-medium">מלאי נמוך:</b> {item.name}
                      <span className="block text-xs text-muted">
                        נשארו {stock.itemOwned(item.id)}, הסף הוא {item.min_quantity}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="המלאי במספרים">
        <dl className="card grid grid-cols-2 divide-line max-sm:divide-y sm:grid-cols-4 sm:divide-x">
          <Figure label="סוגי פריטים" value={view.totals.items} />
          <Figure label="יחידות בבעלות" value={view.totals.owned} />
          <Figure label="יחידות בחוץ כרגע" value={view.totals.out} />
          <Figure label="שווי המלאי לפי עלות" value={fmtMoney(view.totals.value)} />
        </dl>
      </Section>
    </>
  )
}

const Dot = ({ className }: { className: string }) => <span className={`mt-1.5 size-2 shrink-0 rounded-full ${className}`} />

function Figure({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
    </div>
  )
}
