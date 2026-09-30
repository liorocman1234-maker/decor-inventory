import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useStore } from './lib/store'
import Dashboard from './pages/Dashboard'
import EventDetail from './pages/EventDetail'
import Events from './pages/Events'
import Inventory from './pages/Inventory'
import ItemDetail from './pages/ItemDetail'
import Kits from './pages/Kits'
import Labels from './pages/Labels'
import Login from './pages/Login'
import PackingMode from './pages/PackingMode'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Shopping from './pages/Shopping'
import Suppliers from './pages/Suppliers'

export default function App() {
  const { phase, error, toast, mode, signOut } = useStore()

  if (phase === 'loading') {
    return <div className="grid min-h-dvh place-items-center text-sm text-muted">טוען את המלאי...</div>
  }
  if (phase === 'signed-out') return <Login />
  if (phase === 'error') {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="card max-w-md p-6 text-center">
          <p className="font-display text-xl font-bold">לא הצלחנו לפתוח את המלאי</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button className="btn btn-primary" onClick={() => location.reload()}>
              רענון הדף
            </button>
            {mode === 'cloud' ? (
              <button className="btn btn-secondary" onClick={() => void signOut()}>
                התנתקות
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/inventory/:id" element={<ItemDetail />} />
          <Route path="/kits" element={<Kits />} />
          <Route path="/labels" element={<Labels />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id/pack" element={<PackingMode />} />
          <Route path="/shopping" element={<Shopping />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      {toast ? (
        <div
          role="status"
          className={`no-print fixed inset-x-4 bottom-20 z-[60] mx-auto w-fit max-w-[calc(100%-2rem)] rounded-lg px-4 py-2.5 text-sm text-white shadow-lg lg:bottom-6 ${toast.kind === 'error' ? 'bg-wine' : 'bg-ink'}`}
        >
          {toast.message}
        </div>
      ) : null}
    </>
  )
}
