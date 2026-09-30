import { useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { decodeText, parseDelimited } from '../lib/csv'
import { planImport, TEMPLATE_EXAMPLE, TEMPLATE_HEADERS } from '../lib/importItems'
import { useStore } from '../lib/store'
import { Modal } from './ui'

// Byte-order mark: makes Excel read the CSV as UTF-8, so the Hebrew shows correctly.
const BOM = String.fromCharCode(0xfeff)

async function readSpreadsheet(file: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    // Loaded on demand: only the person importing pays for the Excel reader.
    const { readSheet } = await import('read-excel-file/browser')
    return readSheet(file)
  }
  return parseDelimited(decodeText(await file.arrayBuffer()))
}

/** Bulk-add items from an Excel/CSV file, or from cells pasted straight out of a spreadsheet. */
export default function ImportModal({ onClose }: { onClose: () => void }) {
  const { db, user, commit, notify } = useStore()
  const [rows, setRows] = useState<unknown[][] | null>(null)
  const [source, setSource] = useState('')
  const [pasted, setPasted] = useState('')
  const [saving, setSaving] = useState(false)

  const plan = useMemo(() => (rows ? planImport(db, rows, user) : null), [db, rows, user])

  async function pickFile(file: File | undefined) {
    if (!file) return
    try {
      setRows(await readSpreadsheet(file))
      setSource(file.name)
    } catch {
      notify('לא הצלחנו לקרוא את הקובץ. אפשר לשמור אותו כ-xlsx או CSV ולנסות שוב.', 'error')
    }
  }

  function downloadTemplate() {
    const csv = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE].map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([BOM + csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'inventory-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function save() {
    if (!plan || plan.error) return
    setSaving(true)
    if (await commit(plan.ops)) {
      notify(`יובאו ${plan.variants} שורות למלאי`)
      onClose()
    } else {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide
      title="ייבוא מלאי מאקסל"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={plan ? () => setRows(null) : onClose}>
            {plan ? 'חזרה' : 'ביטול'}
          </button>
          {plan ? (
            <button type="button" className="btn btn-primary" disabled={saving || !!plan.error || plan.ops.length === 0} onClick={() => void save()}>
              ייבוא למלאי
            </button>
          ) : null}
        </>
      }
    >
      {plan ? (
        <div className="space-y-4 text-sm">
          <p className="text-muted">מקור: {source}</p>
          {plan.error ? (
            <p className="rounded-lg bg-wine-soft px-4 py-3 text-wine">{plan.error}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ['פריטים חדשים', plan.items],
                  ['שורות מלאי', plan.variants],
                  ['יחידות', plan.units],
                  ['קטגוריות חדשות', plan.categories],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg bg-paper px-4 py-3">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="font-display text-2xl font-bold">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {plan.suppliers ? <p>ייווצרו גם {plan.suppliers} ספקים חדשים.</p> : null}
          {plan.skipped.length ? (
            <div>
              <p className="mb-1 font-medium">{plan.skipped.length} שורות ידולגו:</p>
              <ul className="max-h-40 list-inside list-disc overflow-y-auto text-muted">
                {plan.skipped.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          <div>
            <p>
              השורה הראשונה בגיליון היא כותרות. חובה רק <b className="font-medium">שם פריט</b>. שאר העמודות לא חובה:
            </p>
            <p className="mt-1 text-muted">{TEMPLATE_HEADERS.slice(1).join(', ')}.</p>
            <p className="mt-1 text-muted">שורות עם אותו שם פריט ווריאנט שונה הופכות לפריט אחד עם כמה וריאנטים.</p>
            <button type="button" className="mt-2 text-ink underline underline-offset-4" onClick={downloadTemplate}>
              הורדת קובץ לדוגמה
            </button>
          </div>

          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-paper px-4 py-7 text-center hover:border-ink/40">
            <FileSpreadsheet size={26} className="text-muted" />
            <span className="font-medium">בחירת קובץ Excel או CSV</span>
            <input type="file" accept=".xlsx,.csv,.txt,.tsv" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0])} />
          </label>

          <div>
            <label className="label" htmlFor="import-paste">
              או להעתיק תאים מהאקסל ולהדביק כאן
            </label>
            <textarea
              id="import-paste"
              className="input font-mono text-xs"
              rows={4}
              dir="auto"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="שם פריט	וריאנט	כמות"
            />
            <button
              type="button"
              className="btn btn-secondary mt-2"
              disabled={!pasted.trim()}
              onClick={() => {
                setRows(parseDelimited(pasted))
                setSource('הדבקה מהאקסל')
              }}
            >
              בדיקת מה שהודבק
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
