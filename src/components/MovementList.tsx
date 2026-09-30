import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtDateTime, fmtMoney, MOVEMENT_LABELS } from '../lib/format'
import { useStore } from '../lib/store'
import type { Movement } from '../lib/types'

const PAGE = 25

/** Stock ledger, newest first. `showVariant` names the item on each row when the list spans several. */
export default function MovementList({ movements, showVariant }: { movements: Movement[]; showVariant: boolean }) {
  const { stock } = useStore()
  const [limit, setLimit] = useState(PAGE)
  const sorted = useMemo(() => movements.toSorted((a, b) => b.created_at.localeCompare(a.created_at)), [movements])

  if (sorted.length === 0) return <p className="card px-4 py-5 text-center text-sm text-muted">עדיין אין תנועות מלאי.</p>

  return (
    <div className="card text-sm">
      <ul className="divide-y divide-line">
        {sorted.slice(0, limit).map((m) => {
          const event = m.event_id ? stock.eventById.get(m.event_id) : undefined
          return (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <span dir="ltr" className={`w-12 shrink-0 text-center font-medium ${m.quantity < 0 ? 'text-wine' : 'text-moss'}`}>
                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{MOVEMENT_LABELS[m.kind]}</span>
                {showVariant ? <span className="text-ink-soft"> · {stock.label(m.variant_id)}</span> : null}
                <span className="block truncate text-xs text-muted">
                  {fmtDateTime(m.created_at)}
                  {m.created_by ? ` · ${m.created_by}` : ''}
                  {m.note ? ` · ${m.note}` : ''}
                  {event ? (
                    <>
                      {' · '}
                      <Link to={`/events/${event.id}`} className="underline underline-offset-2">
                        {event.name}
                      </Link>
                    </>
                  ) : null}
                </span>
              </span>
              {m.unit_price && (m.kind === 'purchase' || m.kind === 'sold') ? (
                <span className="shrink-0 text-xs text-muted">{fmtMoney(Math.abs(m.quantity) * m.unit_price)}</span>
              ) : null}
            </li>
          )
        })}
      </ul>
      {sorted.length > limit ? (
        <button className="btn btn-ghost w-full rounded-t-none border-t border-line" onClick={() => setLimit((n) => n + PAGE)}>
          הצגת תנועות נוספות
        </button>
      ) : null}
    </div>
  )
}
