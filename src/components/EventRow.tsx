import { Link } from 'react-router-dom'
import { fmtDateParts, relativeDay } from '../lib/format'
import { shortage } from '../lib/stock'
import { useStore } from '../lib/store'
import type { DecorEvent } from '../lib/types'
import { Badge, StatusBadge } from './ui'

/** One event in a list: a calendar-leaf date block, then the essentials. */
export default function EventRow({ event }: { event: DecorEvent }) {
  const { stock } = useStore()
  const lines = stock.linesOfEvent(event.id)
  const units = lines.reduce((sum, l) => sum + l.quantity, 0)
  const short = event.status === 'closed' ? 0 : lines.filter((l) => shortage(stock, event, l) > 0).length
  const { day, month, weekday } = fmtDateParts(event.event_date)

  return (
    <Link to={`/events/${event.id}`} className="card flex items-center gap-4 p-3 transition-colors hover:border-ink/30">
      <div className="w-16 shrink-0 rounded-lg bg-paper py-2 text-center">
        <p className="font-display text-2xl leading-none font-bold">{day}</p>
        <p className="mt-1 text-xs text-muted">{month}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{event.name}</p>
        <p className="truncate text-xs text-muted">
          {weekday}
          {event.status !== 'closed' ? `, ${relativeDay(event.event_date)}` : ''}
          {event.venue ? ` · ${event.venue}` : ''}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {lines.length} פריטים, {units} יח׳
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge status={event.status} />
        {short ? <Badge tone="wine">{short === 1 ? 'חוסר בפריט אחד' : `חוסר ב-${short} פריטים`}</Badge> : null}
      </div>
    </Link>
  )
}
