import type { EventStatus, MovementKind, Tracking } from './types'

const pad = (n: number) => String(n).padStart(2, '0')
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** Parses YYYY-MM-DD as a local date (new Date('YYYY-MM-DD') would be UTC). */
const parseISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayISO = () => toISO(new Date())
export const addDays = (iso: string, days: number) => {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

const dateFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
const monthFmt = new Intl.DateTimeFormat('he-IL', { month: 'short' })
const weekdayFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long' })
const dateTimeFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const moneyFmt = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

export const fmtDate = (iso: string) => dateFmt.format(parseISO(iso))
export const fmtDateParts = (iso: string) => {
  const d = parseISO(iso)
  return { day: d.getDate(), month: monthFmt.format(d), weekday: weekdayFmt.format(d) }
}
export const fmtDateTime = (timestamp: string) => dateTimeFmt.format(new Date(timestamp))
export const fmtMoney = (n: number) => moneyFmt.format(n)

/** Whole days from today to the given date; negative when it has passed. */
export const daysFromToday = (iso: string) =>
  Math.round((parseISO(iso).getTime() - parseISO(todayISO()).getTime()) / 86_400_000)

export const relativeDay = (iso: string) => {
  const n = daysFromToday(iso)
  if (n === 0) return 'היום'
  if (n === 1) return 'מחר'
  if (n === -1) return 'אתמול'
  return n > 0 ? `בעוד ${n} ימים` : `לפני ${-n} ימים`
}

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  purchase: 'נוסף למלאי',
  adjust: 'תיקון ספירה',
  consumed: 'נצרך',
  sold: 'נמכר',
  damaged: 'נשבר',
  lost: 'אבד',
}

export const STATUS_LABELS: Record<EventStatus, string> = {
  planned: 'מתוכנן',
  out: 'בחוץ',
  closed: 'הסתיים',
}

export const TRACKING_LABELS: Record<Tracking, string> = {
  reusable: 'חוזר מהאירוע',
  consumable: 'מתכלה',
}

/** Cloth-binding colours offered for categories. */
export const SPINE_COLORS = [
  '#7A2E3A',
  '#1F4D43',
  '#B08A3E',
  '#2F4A6D',
  '#8A5A3C',
  '#5E6B4E',
  '#9C6B7E',
  '#4A4453',
  '#C2A878',
  '#3E6B73',
]
export const NO_CATEGORY_COLOR = '#B9C2BB'
