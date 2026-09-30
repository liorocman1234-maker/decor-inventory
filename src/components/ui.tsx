import { useEffect, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import { STATUS_LABELS } from '../lib/format'
import type { EventStatus } from '../lib/types'

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {children ? <div className="no-print flex flex-wrap gap-2">{children}</div> : null}
    </header>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-xl">{title}</h2>
          <button type="button" aria-label="סגירה" onClick={onClose} className="btn btn-ghost px-2">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer> : null}
      </div>
    </div>
  )
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

/** Whole-number input. Empty reads as 0, and the text is selected on focus for quick overwriting. */
export function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  className = '',
  ...rest
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  className?: string
  'aria-label'?: string
}) {
  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      dir="ltr"
      min={min}
      max={max}
      value={String(value)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        let n = Math.round(Number(e.target.value) || 0)
        if (n < min) n = min
        if (max !== undefined && n > max) n = max
        onChange(n)
      }}
      className={`input text-center ${className}`}
    />
  )
}

/** Price in shekels. Uncontrolled so decimals can be typed freely; remount with `key` to reset. */
export function MoneyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      dir="ltr"
      min={0}
      step="0.01"
      defaultValue={value || ''}
      placeholder="0"
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="input text-center"
    />
  )
}

type Tone ='neutral' | 'brass' | 'wine' | 'moss'
const TONES: Record<Tone, string> = {
  neutral: 'bg-ink/6 text-ink-soft',
  brass: 'bg-brass-soft text-[#6f5520]',
  wine: 'bg-wine-soft text-wine',
  moss: 'bg-moss-soft text-moss',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  )
}

const STATUS_TONES: Record<EventStatus, Tone> = { planned: 'neutral', out: 'brass', closed: 'moss' }
export const StatusBadge = ({ status }: { status: EventStatus }) => (
  <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
)

const SEGMENT = 'cursor-pointer rounded-md px-4 py-1.5 whitespace-nowrap'
const SEGMENT_ON = 'bg-ink font-medium text-white'
const SEGMENT_OFF = 'text-ink-soft hover:text-ink'
const SEGMENTS = 'no-print mb-5 inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-1 text-sm'

/** Segmented control that switches a view in place. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: [T, string][] }) {
  return (
    <div role="tablist" className={SEGMENTS}>
      {options.map(([key, label]) => (
        <button key={key} role="tab" aria-selected={value === key} onClick={() => onChange(key)} className={`${SEGMENT} ${value === key ? SEGMENT_ON : SEGMENT_OFF}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

/** The same control, for sibling pages that share one spot in the navigation. */
export function LinkTabs({ tabs }: { tabs: [to: string, label: string][] }) {
  return (
    <nav className={SEGMENTS}>
      {tabs.map(([to, label]) => (
        <NavLink key={to} to={to} end className={({ isActive }) => `${SEGMENT} ${isActive ? SEGMENT_ON : SEGMENT_OFF}`}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 border-dashed px-6 py-12 text-center">
      <p className="font-display text-xl font-bold">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-muted">{hint}</p> : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  )
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
