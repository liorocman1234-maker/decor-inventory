import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, todayISO } from '../lib/format'
import { findShortages } from '../lib/stock'
import { useStore } from '../lib/store'
import EventRow from './EventRow'
import type { DecorEvent, EventStatus } from '../lib/types'

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
const monthTitle = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' })
const CHIP: Record<EventStatus, string> = {
  planned: 'bg-ink text-white',
  out: 'bg-brass text-ink',
  closed: 'bg-ink/10 text-ink-soft',
}

/** Month grid. An event shows solid on the day it goes out and faded on the days until it is back. */
export default function EventCalendar({ onNewEvent }: { onNewEvent: (date: string) => void }) {
  const { db, stock } = useStore()
  const today = todayISO()
  // The first day of the month on screen, as YYYY-MM-01.
  const [month, setMonth] = useState(() => `${today.slice(0, 7)}-01`)

  const shift = (months: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + months, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }

  const { days, byDay, inMonth, short } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const start = addDays(month, -first.getDay())
    // Whole weeks, Sunday first, covering the month.
    const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7)
    const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))

    const byDay = new Map<string, { event: DecorEvent; first: boolean }[]>()
    for (const event of db.events) {
      if (event.return_date < days[0] || event.event_date > days[days.length - 1]) continue
      for (let day = event.event_date; day <= event.return_date; day = addDays(day, 1)) {
        const list = byDay.get(day) ?? []
        list.push({ event, first: day === event.event_date })
        byDay.set(day, list)
      }
    }
    const monthEnd = addDays(month, new Date(y, m, 0).getDate() - 1)
    const inMonth = db.events
      .filter((e) => e.event_date <= monthEnd && e.return_date >= month)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
    return { days, byDay, inMonth, short: new Set(findShortages(db, stock).map((s) => s.event.id)) }
  }, [db, stock, month])

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl">{monthTitle.format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1))}</h2>
        <div className="flex gap-1">
          <button className="btn btn-secondary px-2.5" aria-label="החודש הקודם" onClick={() => shift(-1)}>
            <ChevronRight size={18} />
          </button>
          <button className="btn btn-secondary" onClick={() => setMonth(`${today.slice(0, 7)}-01`)}>
            היום
          </button>
          <button className="btn btn-secondary px-2.5" aria-label="החודש הבא" onClick={() => shift(1)}>
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-paper text-center text-xs font-medium text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const current = day.slice(0, 7) === month.slice(0, 7)
            const entries = byDay.get(day) ?? []
            return (
              <div
                key={day}
                className={`group relative min-h-20 border-line p-1 sm:min-h-28 ${i % 7 ? 'border-s' : ''} ${i >= 7 ? 'border-t' : ''} ${current ? '' : 'bg-paper/70'}`}
              >
                <button
                  type="button"
                  onClick={() => onNewEvent(day)}
                  aria-label={`אירוע חדש בתאריך ${day}`}
                  className={`mb-1 grid size-6 cursor-pointer place-items-center rounded-full text-xs hover:bg-ink/10 ${
                    day === today ? 'bg-ink font-semibold text-white hover:bg-ink' : current ? '' : 'text-muted/60'
                  }`}
                >
                  {Number(day.slice(8))}
                </button>
                <div className="space-y-1">
                  {entries.map(({ event, first }) => (
                    <Link
                      key={event.id}
                      to={`/events/${event.id}`}
                      title={event.name}
                      className={`block truncate rounded px-1.5 py-0.5 text-[11px] leading-tight sm:text-xs ${CHIP[event.status]} ${first ? '' : 'opacity-45'} ${
                        short.has(event.id) ? 'ring-2 ring-wine' : ''
                      }`}
                    >
                      {first ? event.name : 'עד החזרה'}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <Legend className="bg-ink" label="מתוכנן" />
        <Legend className="bg-brass" label="בחוץ" />
        <Legend className="bg-ink/10" label="הסתיים" />
        <Legend className="bg-surface ring-2 ring-wine" label="יש חוסר בציוד" />
        <span>לחיצה על מספר היום יוצרת אירוע בתאריך הזה.</span>
      </p>

      {/* Names do not fit in the grid on a phone, so the month's events are also listed in full. */}
      <div className="mt-4 space-y-2 sm:hidden">
        {inMonth.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  )
}

const Legend = ({ className, label }: { className: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`size-3 rounded ${className}`} />
    {label}
  </span>
)
