import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import CloseEventModal from '../components/CloseEventModal'
import { upd } from '../lib/db'
import { shortageWarning } from '../lib/stock'
import { useStore } from '../lib/store'

/**
 * A phone-first checklist for the warehouse floor. Before the event it tracks
 * what has been loaded; once the event is out, what has been counted back in.
 * Ticks are saved, so two people can pack the same event from two phones.
 */
export default function PackingMode() {
  const { id = '' } = useParams()
  const { stock, commit, notify } = useStore()
  const [closing, setClosing] = useState(false)

  const event = stock.eventById.get(id)
  if (!event || event.status === 'closed') return <Navigate to={`/events/${id}`} replace />

  const returning = event.status === 'out'
  const flag = returning ? 'checked_back' : 'packed'
  // Walk the warehouse once: group by shelf, then by name.
  const lines = stock.linesOfEvent(event.id).toSorted((a, b) => {
    const byShelf = (stock.itemOf(a.variant_id)?.location ?? '').localeCompare(stock.itemOf(b.variant_id)?.location ?? '', 'he')
    return byShelf || stock.label(a.variant_id).localeCompare(stock.label(b.variant_id), 'he')
  })
  const done = lines.filter((l) => l[flag]).length
  const allDone = lines.length > 0 && done === lines.length

  const markOut = async () => {
    const warning = shortageWarning(stock, event)
    if (warning && !confirm(warning)) return
    if (await commit([upd('events', event.id, { status: 'out' })])) notify('הציוד סומן כיצא לאירוע')
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link to={`/events/${event.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ChevronRight size={16} />
        חזרה לאירוע
      </Link>
      <h1 className="text-2xl">{returning ? 'בדיקת החזרה' : 'אריזה'}</h1>
      <p className="mt-1 text-sm text-muted">{event.name}</p>

      <div className="sticky top-0 z-10 -mx-4 mt-4 bg-paper px-4 py-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">
            {done} מתוך {lines.length} {returning ? 'נבדקו' : 'נארזו'}
          </span>
          {allDone ? <span className="text-moss">הכול מסומן</span> : null}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={lines.length} aria-valuenow={done}>
          <div className="h-full rounded-full bg-moss transition-[width]" style={{ width: `${lines.length ? (done / lines.length) * 100 : 0}%` }} />
        </div>
      </div>

      <ul className="mt-2 space-y-2">
        {lines.map((line) => {
          const checked = line[flag]
          const location = stock.itemOf(line.variant_id)?.location
          return (
            <li key={line.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => void commit([upd('event_items', line.id, { [flag]: !checked })])}
                className={`card flex w-full cursor-pointer items-center gap-4 p-4 text-start transition-colors ${checked ? 'border-moss/40 bg-moss-soft' : ''}`}
              >
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg border-2 ${checked ? 'border-moss bg-moss text-white' : 'border-line bg-surface'}`}>
                  {checked ? <Check size={20} strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${checked ? 'text-ink-soft line-through' : ''}`}>{stock.label(line.variant_id)}</span>
                  {location ? <span className="block text-xs text-muted">{location}</span> : null}
                </span>
                <span className="shrink-0 font-display text-3xl font-bold">{line.quantity}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-6">
        {returning ? (
          <>
            <button className="btn btn-primary h-12 w-full text-base" onClick={() => setClosing(true)}>
              סגירת אירוע והחזרת ציוד
            </button>
            <p className="mt-2 text-center text-xs text-muted">בסגירה רושמים מה נשבר, אבד, נצרך או נמכר.</p>
          </>
        ) : (
          <button className="btn btn-primary h-12 w-full text-base" disabled={!allDone} onClick={() => void markOut()}>
            {allDone ? 'הציוד יצא לאירוע' : 'מסמנים את כל הפריטים כדי לסיים'}
          </button>
        )}
      </div>

      {closing ? <CloseEventModal event={event} onClose={() => setClosing(false)} /> : null}
    </div>
  )
}
