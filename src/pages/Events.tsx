import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import EventCalendar from '../components/EventCalendar'
import EventForm from '../components/EventForm'
import EventRow from '../components/EventRow'
import { EmptyState, PageHeader, Segmented } from '../components/ui'
import { useStore } from '../lib/store'

type View = 'open' | 'calendar' | 'closed'

export default function Events() {
  const { db } = useStore()
  const navigate = useNavigate()
  // The view lives in the address so the calendar can be bookmarked and survives going back from an event.
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'calendar' ? 'calendar' : params.get('view') === 'closed' ? 'closed' : 'open'
  const setView = (next: View) => setParams(next === 'open' ? {} : { view: next }, { replace: true })
  // null = form closed; '' = new event with no preset date.
  const [newEventDate, setNewEventDate] = useState<string | null>(null)

  const { open, closed } = useMemo(() => {
    const byDate = db.events.toSorted((a, b) => a.event_date.localeCompare(b.event_date))
    return {
      open: byDate.filter((e) => e.status !== 'closed'),
      closed: byDate.filter((e) => e.status === 'closed').reverse(),
    }
  }, [db.events])
  const list = view === 'closed' ? closed : open

  return (
    <>
      <PageHeader title="אירועים" subtitle="כל אירוע משריין ציוד לתאריכים שלו">
        <button className="btn btn-primary" onClick={() => setNewEventDate('')}>
          <Plus size={16} />
          אירוע חדש
        </button>
      </PageHeader>

      <Segmented
        value={view}
        onChange={setView}
        options={[
          ['open', `פתוחים (${open.length})`],
          ['calendar', 'לוח שנה'],
          ['closed', `הסתיימו (${closed.length})`],
        ]}
      />

      {view === 'calendar' ? (
        <EventCalendar onNewEvent={setNewEventDate} />
      ) : list.length ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {list.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </div>
      ) : view === 'open' ? (
        <EmptyState title="אין אירועים פתוחים" hint="יוצרים אירוע, מוסיפים לו ציוד, והמערכת מראה מה פנוי בתאריך הזה.">
          <button className="btn btn-primary" onClick={() => setNewEventDate('')}>
            יצירת אירוע
          </button>
        </EmptyState>
      ) : (
        <EmptyState title="עדיין לא נסגרו אירועים" hint="אירוע עובר לכאן אחרי שהציוד חזר ונסגר." />
      )}

      {newEventDate !== null ? (
        <EventForm initialDate={newEventDate || undefined} onClose={() => setNewEventDate(null)} onSaved={(id) => navigate(`/events/${id}`)} />
      ) : null}
    </>
  )
}
