import { useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, ClipboardCheck, Copy, ListChecks, Pencil, Printer, Trash2 } from 'lucide-react'
import CloseEventModal from '../components/CloseEventModal'
import EventForm from '../components/EventForm'
import EventItemsModal from '../components/EventItemsModal'
import { Badge, EmptyState, PageHeader, Section, StatusBadge } from '../components/ui'
import { del, upd } from '../lib/db'
import { fmtDate, fmtDateParts, relativeDay, todayISO } from '../lib/format'
import { reopenEventOps, shortage, shortageWarning } from '../lib/stock'
import { useStore } from '../lib/store'

const OUTCOMES = [
  ['returned', 'חזרו'],
  ['consumed', 'נצרכו'],
  ['sold', 'נמכרו'],
  ['damaged', 'נשברו'],
  ['lost', 'אבדו'],
] as const

export default function EventDetail() {
  const { id = '' } = useParams()
  const { db, stock, commit, notify } = useStore()
  const navigate = useNavigate()
  const [modal, setModal] = useState<'edit' | 'items' | 'close' | 'copy' | null>(null)

  const event = stock.eventById.get(id)
  if (!event) return <Navigate to="/events" replace />

  const closed = event.status === 'closed'
  const lines = stock.linesOfEvent(event.id).toSorted((a, b) => stock.label(a.variant_id).localeCompare(stock.label(b.variant_id), 'he'))
  const units = lines.reduce((sum, l) => sum + l.quantity, 0)
  const late = event.status === 'out' && event.return_date < todayISO()

  const setStatus = async (status: 'planned' | 'out', message: string) => {
    const warning = status === 'out' ? shortageWarning(stock, event) : ''
    if (warning && !confirm(warning)) return
    if (await commit([upd('events', event.id, { status })])) notify(message)
  }

  async function reopen() {
    if (!confirm('לפתוח את האירוע מחדש? רישומי הנשבר, האבד, הנצרך והנמכר של האירוע יבוטלו, והציוד יחזור להיחשב בחוץ.')) return
    if (await commit(reopenEventOps(db, event!.id))) notify('האירוע נפתח מחדש')
  }

  async function remove() {
    if (!confirm(`למחוק את "${event!.name}"? השריון של הציוד לאירוע יבוטל.`)) return
    if (await commit([del('events', event!.id)])) {
      notify('האירוע נמחק')
      navigate('/events')
    }
  }

  return (
    <>
      <Link to="/events" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ChevronRight size={16} />
        חזרה לאירועים
      </Link>

      <PageHeader title={event.name} subtitle={`${fmtDateParts(event.event_date).weekday}, ${fmtDate(event.event_date)}${closed ? '' : ` (${relativeDay(event.event_date)})`}`}>
        <button className="btn btn-secondary" onClick={() => setModal('edit')}>
          <Pencil size={15} />
          עריכה
        </button>
        <button className="btn btn-secondary" onClick={() => setModal('copy')}>
          <Copy size={15} />
          שכפול
        </button>
        <button className="btn btn-secondary" onClick={() => window.print()}>
          <Printer size={15} />
          הדפסת רשימה
        </button>
        <button className="btn btn-ghost px-2.5 text-wine" aria-label="מחיקת האירוע" onClick={() => void remove()}>
          <Trash2 size={16} />
        </button>
      </PageHeader>

      <div className="card mb-8 flex flex-wrap items-center gap-x-8 gap-y-3 p-4 text-sm">
        <StatusBadge status={event.status} />
        <Detail label="חוזר למחסן" value={fmtDate(event.return_date)} />
        {event.venue ? <Detail label="מקום" value={event.venue} /> : null}
        {event.client_name ? <Detail label="איש קשר" value={event.client_name} /> : null}
        {event.client_phone ? (
          <Detail label="טלפון" value={<a href={`tel:${event.client_phone}`} dir="ltr" className="underline underline-offset-2">{event.client_phone}</a>} />
        ) : null}
        <div className="no-print ms-auto flex flex-wrap gap-2">
          {!closed && lines.length ? (
            <Link to={`/events/${event.id}/pack`} className="btn btn-secondary">
              <ClipboardCheck size={16} />
              {event.status === 'planned' ? 'מצב אריזה' : 'בדיקת החזרה'}
            </Link>
          ) : null}
          {event.status === 'planned' ? (
            <button className="btn btn-primary" disabled={lines.length === 0} onClick={() => void setStatus('out', 'הציוד סומן כיצא לאירוע')}>
              הציוד יצא לאירוע
            </button>
          ) : null}
          {event.status === 'out' ? (
            <>
              <button className="btn btn-ghost" onClick={() => void setStatus('planned', 'האירוע חזר למצב מתוכנן')}>
                ביטול יציאה
              </button>
              <button className="btn btn-primary" onClick={() => setModal('close')}>
                סגירת אירוע והחזרת ציוד
              </button>
            </>
          ) : null}
          {closed ? (
            <button className="btn btn-secondary" onClick={() => void reopen()}>
              פתיחה מחדש
            </button>
          ) : null}
        </div>
        {late ? <p className="w-full text-wine">הציוד היה אמור לחזור {relativeDay(event.return_date)}. אחרי שהוא חוזר, סוגרים את האירוע.</p> : null}
        {event.notes ? <p className="w-full whitespace-pre-line text-ink-soft">{event.notes}</p> : null}
      </div>

      <Section
        title={`רשימת ציוד (${lines.length} פריטים, ${units} יח׳)`}
        action={
          closed ? null : (
            <button className="no-print btn btn-secondary" onClick={() => setModal('items')}>
              <ListChecks size={16} />
              {lines.length ? 'עריכת הרשימה' : 'הוספת ציוד'}
            </button>
          )
        }
      >
        {lines.length === 0 ? (
          <EmptyState title="עדיין לא שויך ציוד" hint="בוחרים פריטים מהמלאי, והם נשמרים לאירוע הזה בתאריכים שלו.">
            {closed ? null : (
              <button className="btn btn-primary" onClick={() => setModal('items')}>
                הוספת ציוד
              </button>
            )}
          </EmptyState>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {lines.map((line) => {
              const item = stock.itemOf(line.variant_id)
              const missing = closed ? 0 : shortage(stock, event, line)
              return (
                <li key={line.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Tick box for packing from the printed list. */}
                  <span className="hidden size-4 shrink-0 border border-ink print:block" />
                  <span className="min-w-0 flex-1">
                    {item ? (
                      <Link to={`/inventory/${item.id}`} className="font-medium hover:underline">
                        {stock.label(line.variant_id)}
                      </Link>
                    ) : (
                      stock.label(line.variant_id)
                    )}
                    {item?.location ? <span className="block text-xs text-muted">{item.location}</span> : null}
                    {closed ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {OUTCOMES.filter(([key]) => line[key] > 0).map(([key, label]) => (
                          <Badge key={key} tone={key === 'returned' ? 'moss' : key === 'damaged' || key === 'lost' ? 'wine' : 'neutral'}>
                            {label} {line[key]}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  {missing ? <Badge tone="wine">חסרות {missing}</Badge> : null}
                  <span className="w-14 shrink-0 text-center font-display text-xl font-bold">{line.quantity}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {modal === 'edit' ? <EventForm event={event} onClose={() => setModal(null)} /> : null}
      {modal === 'copy' ? <EventForm copyFrom={event} onClose={() => setModal(null)} onSaved={(newId) => navigate(`/events/${newId}`)} /> : null}
      {modal === 'items' ? <EventItemsModal event={event} onClose={() => setModal(null)} /> : null}
      {modal === 'close' ? <CloseEventModal event={event} onClose={() => setModal(null)} /> : null}
    </>
  )
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p>{value}</p>
    </div>
  )
}
