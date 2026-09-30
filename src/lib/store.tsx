import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createBackend, NOT_MEMBER, type Backend } from './backend'
import { applyOps, emptyDb, type Op } from './db'
import { todayISO } from './format'
import { buildStock, type StockIndex } from './stock'
import type { DB } from './types'

type Phase = 'loading' | 'signed-out' | 'ready' | 'error'

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
}

interface Store {
  phase: Phase
  error: string
  mode: Backend['mode']
  user: string
  db: DB
  stock: StockIndex
  toast: Toast | null
  /** Applies ops immediately on screen, then saves them. Resolves to false if the save failed. */
  commit(ops: Op[]): Promise<boolean>
  /** Replaces the whole database. Demo mode only. */
  replaceAll(db: DB): Promise<void>
  uploadImage(file: File): Promise<string>
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  notify(message: string, kind?: Toast['kind']): void
}

const StoreContext = createContext<Store | null>(null)

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside StoreProvider')
  return store
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [user, setUser] = useState('')
  const [db, setDb] = useState<DB>(emptyDb)
  const [toast, setToast] = useState<Toast | null>(null)
  const [mode, setMode] = useState<Backend['mode']>('local')

  const backendRef = useRef<Backend | null>(null)
  const dbRef = useRef(db)
  // Remote-change refreshes wait while our own saves are in flight, so a
  // half-saved batch is never read back over the optimistic state.
  const pending = useRef(0)
  const stale = useRef(false)

  const notify = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    setToast({ id: Date.now(), message, kind })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 2800)
    return () => clearTimeout(timer)
  }, [toast])

  const load = useCallback(async () => {
    try {
      const loaded = await backendRef.current!.load()
      dbRef.current = loaded
      setDb(loaded)
      setPhase('ready')
    } catch (e) {
      setError(
        e instanceof Error && e.message === NOT_MEMBER
          ? 'המשתמש הזה עדיין לא צורף לצוות. יש להוסיף אותו לטבלת team_members לפי ההוראות בקובץ README.'
          : 'טעינת הנתונים נכשלה. כדאי לבדוק את החיבור לאינטרנט ולרענן את הדף.',
      )
      setPhase('error')
    }
  }, [])

  const refresh = useCallback(() => {
    if (pending.current > 0) stale.current = true
    else void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const backend = await createBackend()
        if (cancelled) return
        backendRef.current = backend
        setMode(backend.mode)
        const name = await backend.init()
        if (cancelled) return
        if (name === null) return setPhase('signed-out')
        setUser(name)
        await load()
      } catch {
        setError('ההתחברות לשרת נכשלה. כדאי לבדוק את החיבור לאינטרנט ולרענן את הדף.')
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  useEffect(() => {
    if (phase !== 'ready') return
    return backendRef.current!.subscribe(refresh)
  }, [phase, refresh])

  const commit = useCallback(
    async (ops: Op[]) => {
      if (ops.length === 0) return true
      const next = applyOps(dbRef.current, ops)
      dbRef.current = next
      setDb(next)
      pending.current++
      let ok = true
      try {
        await backendRef.current!.apply(ops, next)
      } catch (e) {
        console.error(e)
        ok = false
        stale.current = true
        notify('השמירה נכשלה, הנתונים נטענים מחדש. כדאי לבדוק את החיבור ולנסות שוב.', 'error')
      }
      pending.current--
      if (pending.current === 0 && stale.current) {
        stale.current = false
        await load()
      }
      return ok
    },
    [load, notify],
  )

  const replaceAll = useCallback(async (next: DB) => {
    dbRef.current = next
    setDb(next)
    await backendRef.current!.apply([], next)
  }, [])

  const uploadImage = useCallback((file: File) => backendRef.current!.uploadImage(file), [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const name = await backendRef.current!.signIn(email, password)
      setUser(name)
      setPhase('loading')
      await load()
    },
    [load],
  )

  const signOut = useCallback(async () => {
    await backendRef.current!.signOut()
    dbRef.current = emptyDb()
    setDb(dbRef.current)
    setUser('')
    setPhase('signed-out')
  }, [])

  const stock = useMemo(() => buildStock(db, todayISO()), [db])

  const value = useMemo<Store>(
    () => ({ phase, error, mode, user, db, stock, toast, commit, replaceAll, uploadImage, signIn, signOut, notify }),
    [phase, error, mode, user, db, stock, toast, commit, replaceAll, uploadImage, signIn, signOut, notify],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
