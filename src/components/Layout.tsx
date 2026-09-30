import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, ClipboardList, LayoutDashboard, Package, Settings, Truck } from 'lucide-react'
import { useStore } from '../lib/store'

export const APP_NAME = 'המדף'

const NAV = [
  { to: '/', label: 'לוח בקרה', short: 'בית', icon: LayoutDashboard, also: [] },
  { to: '/inventory', label: 'מלאי', short: 'מלאי', icon: Package, also: ['/kits', '/labels'] },
  { to: '/events', label: 'אירועים', short: 'אירועים', icon: CalendarDays, also: [] },
  { to: '/suppliers', label: 'ספקים ורכש', short: 'רכש', icon: Truck, also: ['/shopping'] },
  { to: '/reports', label: 'דוחות', short: 'דוחות', icon: ClipboardList, also: [] },
  { to: '/settings', label: 'הגדרות', short: 'הגדרות', icon: Settings, also: [] },
]

// Several pages share one navigation entry (sets live under inventory, the shopping list under suppliers).
const isActive = (pathname: string, item: (typeof NAV)[number]) =>
  item.to === '/' ? pathname === '/' : [item.to, ...item.also].some((p) => pathname === p || pathname.startsWith(`${p}/`))

export default function Layout({ children }: { children: ReactNode }) {
  const { mode, user } = useStore()
  const { pathname } = useLocation()

  return (
    <>
      <aside className="no-print fixed inset-y-0 start-0 hidden w-60 flex-col bg-ink text-white lg:flex">
        <div className="px-6 pt-7 pb-6">
          <p className="font-display text-3xl font-bold">{APP_NAME}</p>
          <p className="mt-1 text-xs text-white/60">ניהול מלאי ואירועים</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive(pathname, item) ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive(pathname, item) ? 'bg-white/10 font-medium text-white shadow-[inset_-3px_0_0_var(--color-brass)]' : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 px-6 py-4 text-xs text-white/60">
          {mode === 'local' ? 'מצב הדגמה: הנתונים נשמרים בדפדפן הזה בלבד' : <span dir="ltr">{user}</span>}
        </div>
      </aside>

      <header className="no-print flex items-baseline justify-between bg-ink px-4 py-3 text-white lg:hidden">
        <p className="font-display text-2xl font-bold">{APP_NAME}</p>
        {mode === 'local' ? <p className="text-xs text-white/60">מצב הדגמה</p> : null}
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 lg:ms-60 lg:px-10 lg:pt-10 lg:pb-12">{children}</main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            aria-current={isActive(pathname, item) ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 py-2 text-[11px] ${isActive(pathname, item) ? 'font-semibold text-ink' : 'text-muted'}`}
          >
            <item.icon size={20} />
            {item.short}
          </Link>
        ))}
      </nav>
    </>
  )
}
