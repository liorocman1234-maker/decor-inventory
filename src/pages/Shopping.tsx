import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, MessageCircle, PackageCheck } from 'lucide-react'
import { EmptyState, LinkTabs, NumberInput, PageHeader } from '../components/ui'
import { fmtMoney } from '../lib/format'
import { buildShoppingList, orderMessage, whatsappLink, type ShoppingGroup, type ShoppingLine } from '../lib/shopping'
import { movementOp } from '../lib/stock'
import { useStore } from '../lib/store'

export const SUPPLIER_TABS: [string, string][] = [
  ['/suppliers', 'ספקים'],
  ['/shopping', 'רשימת קניות'],
]

export default function Shopping() {
  const { db, stock } = useStore()
  const groups = useMemo(() => buildShoppingList(db, stock), [db, stock])

  return (
    <>
      <PageHeader title="ספקים ורכש" subtitle="מה חסר לאירועים ומה ירד מתחת לסף, מרוכז לפי ספק" />
      <LinkTabs tabs={SUPPLIER_TABS} />

      {groups.length === 0 ? (
        <EmptyState title="אין מה לקנות כרגע" hint="פריט מופיע כאן כשחסרות ממנו יחידות לאירוע, או כשהמלאי שלו ירד מתחת לסף שהוגדר לו." />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <SupplierOrder key={group.supplier?.id ?? 'none'} group={group} />
          ))}
        </div>
      )}
    </>
  )
}

function SupplierOrder({ group }: { group: ShoppingGroup }) {
  const { user, commit, notify } = useStore()
  // Quantities the team edited; untouched lines use the suggested quantity.
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const quantityOf = (line: ShoppingLine) => quantities[line.key] ?? line.quantity

  const message = orderMessage(group, quantities)
  const whatsapp = group.supplier ? whatsappLink(group.supplier.phone, message) : null
  const total = group.lines.reduce((sum, l) => sum + quantityOf(l) * l.unitCost, 0)

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      notify('ההזמנה הועתקה')
    } catch {
      notify('ההעתקה נכשלה. אפשר לסמן את הטקסט ולהעתיק ידנית.', 'error')
    }
  }

  async function received(line: ShoppingLine) {
    const quantity = quantityOf(line)
    if (!line.variantId || quantity < 1) return
    if (await commit([movementOp(line.variantId, 'purchase', quantity, { unitPrice: line.unitCost, note: 'התקבל מרשימת הקניות', user })])) {
      notify(`נוספו למלאי ${quantity} יח׳: ${line.label}`)
    }
  }

  return (
    <section className="card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-xl">{group.supplier?.name ?? 'ללא ספק'}</h2>
          <p className="text-xs text-muted">
            {group.supplier ? [group.supplier.contact_name, group.supplier.phone].filter(Boolean).join(' · ') : 'אפשר לשייך ספק בעריכת הפריט'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noreferrer" className="btn btn-primary">
              <MessageCircle size={16} />
              שליחה בוואטסאפ
            </a>
          ) : null}
          <button className="btn btn-secondary" onClick={() => void copy()}>
            <Copy size={15} />
            העתקת ההזמנה
          </button>
        </div>
      </header>

      <ul className="divide-y divide-line text-sm">
        {group.lines.map((line) => (
          <li key={line.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <span className="min-w-40 flex-1">
              <Link to={`/inventory/${line.itemId}`} className="font-medium hover:underline">
                {line.label}
              </Link>
              {line.reasons.map((reason) => (
                <span key={reason} className="block text-xs text-muted">
                  {reason}
                </span>
              ))}
            </span>
            <NumberInput aria-label={`כמות להזמנה: ${line.label}`} className="w-20" value={quantityOf(line)} onChange={(n) => setQuantities((q) => ({ ...q, [line.key]: n }))} />
            {line.variantId ? (
              <button className="btn btn-secondary btn-sm" disabled={quantityOf(line) < 1} onClick={() => void received(line)}>
                <PackageCheck size={14} />
                התקבל
              </button>
            ) : (
              <Link to={`/inventory/${line.itemId}`} className="btn btn-secondary btn-sm">
                בחירת וריאנט
              </Link>
            )}
          </li>
        ))}
      </ul>
      {total ? <p className="border-t border-line px-4 py-2.5 text-xs text-muted">עלות משוערת: {fmtMoney(total)}</p> : null}
    </section>
  )
}
