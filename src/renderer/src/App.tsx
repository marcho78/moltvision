import React, { useEffect, useState } from 'react'
import { TitleBar } from './components/shell/TitleBar'
import { Sidebar } from './components/shell/Sidebar'
import { PanelContainer } from './components/shell/PanelContainer'
import { StatusBar } from './components/shell/StatusBar'
import { CommandPalette } from './components/shell/CommandPalette'
import { useKeyboard } from './hooks/useKeyboard'
import { useAutopilotEvents } from './hooks/useAutopilotEvents'
import { useStore } from './stores'
import { invoke, on } from './lib/ipc'
import { IPC } from '@shared/ipc-channels'

function NotificationToast() {
  const { notifications, dismissNotification } = useStore()

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-10 right-4 z-40 space-y-2 max-w-sm">
      {notifications.slice(-5).map((n) => {
        const colors = {
          info: 'bg-molt-info/20 border-molt-info/40 text-molt-info',
          success: 'bg-molt-success/20 border-molt-success/40 text-molt-success',
          warning: 'bg-molt-warning/20 border-molt-warning/40 text-molt-warning',
          error: 'bg-molt-error/20 border-molt-error/40 text-molt-error'
        }
        return (
          <div
            key={n.id}
            className={`px-4 py-2 rounded-lg border text-sm flex items-center justify-between gap-2 animate-in ${colors[n.type]}`}
          >
            <span>{n.message}</span>
            <button
              onClick={() => dismissNotification(n.id)}
              className="opacity-60 hover:opacity-100"
            >
              &times;
            </button>
          </div>
        )
      })}
    </div>
  )
}

function SubmoltSyncModal({ onClose }: { onClose: () => void }) {
  const [syncing, setSyncing] = useState(false)
  const [phase, setPhase] = useState('')
  const [cached, setCached] = useState(0)
  const [total, setTotal] = useState(0)
  const { setActivePanel } = useStore()

  useEffect(() => {
    return on(IPC.SUBMOLTS_CACHE_STATUS, (s: unknown) => {
      const data = s as { syncing: boolean; cached: number; total: number; phase: string }
      setSyncing(data.syncing)
      setPhase(data.phase)
      setCached(data.cached)
      setTotal(data.total)
      if (!data.syncing && data.cached > 0) {
        // Sync finished — auto-close after a moment
        setTimeout(onClose, 1500)
      }
    })
  }, [onClose])

  const handleSync = () => {
    setSyncing(true)
    setPhase('Starting...')
    invoke(IPC.SUBMOLTS_CACHE_SYNC, { force: false }).catch(() => {})
  }

  const handleGoToSettings = () => {
    setActivePanel('settings')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-molt-surface border border-molt-border rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-molt-text">Sync Submolt Database</h2>

        <p className="text-sm text-molt-muted leading-relaxed">
          Would you like to download all Moltbook communities? This is a one-time sync that stores submolts
          locally so you can search and browse them instantly. Depending on your connection this may take a while.
        </p>

        <p className="text-xs text-molt-muted">
          You can continue using the app while syncing runs in the background. You can also do this later from <strong>Settings &gt; Data</strong>.
        </p>

        {syncing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                className="animate-spin text-molt-accent shrink-0" strokeLinecap="round">
                <path d="M14 8A6 6 0 112.5 5.5" />
              </svg>
              <span className="text-xs text-molt-muted">{phase}</span>
            </div>
            {total > 0 && (
              <div className="w-full h-1.5 bg-molt-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-molt-accent rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((cached / total) * 100, 100)}%` }}
                />
              </div>
            )}
            {!syncing && cached > 0 && (
              <p className="text-xs text-molt-success">Sync complete! {cached.toLocaleString()} communities cached.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {!syncing ? (
            <>
              <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">Later</button>
              <button onClick={handleSync} className="btn-primary text-sm px-4 py-2">Sync Now</button>
            </>
          ) : (
            <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">
              Continue in Background
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function App() {
  useKeyboard()
  useAutopilotEvents()
  const { setConnectionStatus } = useStore()
  const [showSyncModal, setShowSyncModal] = useState(false)

  // Auto-test Moltbook connection on startup, then check submolt cache
  useEffect(() => {
    let ignore = false
    invoke<{ result: { valid: boolean; provider: string } }>(IPC.SETTINGS_TEST_CONNECTION, { provider: 'moltbook' })
      .then((res) => {
        if (ignore) return
        setConnectionStatus('moltbook', res.result.valid)
        // If connected, check if submolts are cached
        if (res.result.valid) {
          invoke<{ total_cached: number }>(IPC.SUBMOLTS_SEARCH_CACHED, { keyword: '', limit: 1 })
            .then((resp) => {
              if (!ignore && (resp?.total_cached ?? 0) === 0) {
                setShowSyncModal(true)
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => { if (!ignore) setConnectionStatus('moltbook', false) })
    return () => { ignore = true }
  }, [])

  return (
    <div className="h-screen flex flex-col bg-molt-bg text-molt-text">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <PanelContainer />
      </div>
      <StatusBar />
      <CommandPalette />
      <NotificationToast />
      {showSyncModal && <SubmoltSyncModal onClose={() => setShowSyncModal(false)} />}
    </div>
  )
}
