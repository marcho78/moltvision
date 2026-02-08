import React, { useEffect, useState } from 'react'
import { TitleBar } from './components/shell/TitleBar'
import { Sidebar } from './components/shell/Sidebar'
import { PanelContainer } from './components/shell/PanelContainer'
import { StatusBar } from './components/shell/StatusBar'
import { CommandPalette } from './components/shell/CommandPalette'
import { useKeyboard } from './hooks/useKeyboard'
import { useAutopilotEvents } from './hooks/useAutopilotEvents'
import { useTheme } from './hooks/useTheme'
import { useStore } from './stores'
import { invoke, on } from './lib/ipc'
import { IPC } from '@shared/ipc-channels'

// Auto-dismiss durations by type (ms). Errors stay until manually dismissed.
const TOAST_DURATIONS: Record<string, number> = {
  info: 4000,
  success: 3000,
  warning: 6000,
  error: 0 // 0 = no auto-dismiss
}

function Toast({ id, message, type, timestamp }: {
  id: string; message: string; type: 'info' | 'success' | 'warning' | 'error'; timestamp: number
}) {
  const dismissNotification = useStore((s) => s.dismissNotification)
  const [exiting, setExiting] = useState(false)

  const dismiss = React.useCallback(() => {
    setExiting(true)
    setTimeout(() => dismissNotification(id), 200)
  }, [id, dismissNotification])

  useEffect(() => {
    const duration = TOAST_DURATIONS[type]
    if (!duration) return
    const timer = setTimeout(dismiss, duration)
    return () => clearTimeout(timer)
  }, [type, dismiss])

  const styles = {
    info: {
      bg: 'bg-molt-info/10', border: 'border-molt-info/30', text: 'text-molt-info',
      icon: <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a1 1 0 110 2 1 1 0 010-2zm-1 4h2v4H7V8z" />
    },
    success: {
      bg: 'bg-molt-success/10', border: 'border-molt-success/30', text: 'text-molt-success',
      icon: <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.7 5.3l-4 4a1 1 0 01-1.4 0l-2-2a1 1 0 011.4-1.4L7 8.2l3.3-3.3a1 1 0 011.4 1.4z" />
    },
    warning: {
      bg: 'bg-molt-warning/10', border: 'border-molt-warning/30', text: 'text-molt-warning',
      icon: <path d="M8.9 2.5a1 1 0 00-1.8 0l-5.5 11A1 1 0 002.5 15h11a1 1 0 00.9-1.5l-5.5-11zM8 5a1 1 0 011 1v3a1 1 0 01-2 0V6a1 1 0 011-1zm0 7a1 1 0 110 2 1 1 0 010-2z" />
    },
    error: {
      bg: 'bg-molt-error/10', border: 'border-molt-error/30', text: 'text-molt-error',
      icon: <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm2.7 4.3a1 1 0 010 1.4L9.4 8l1.3 1.3a1 1 0 01-1.4 1.4L8 9.4l-1.3 1.3a1 1 0 01-1.4-1.4L6.6 8 5.3 6.7a1 1 0 011.4-1.4L8 6.6l1.3-1.3a1 1 0 011.4 0z" />
    }
  }

  const s = styles[type]

  return (
    <div
      className={`${s.bg} ${s.border} border rounded-xl px-4 py-3 shadow-lg shadow-black/30 flex items-start gap-3 max-w-sm transition-all duration-200 ${
        exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      }`}
      style={{ animation: exiting ? 'none' : 'toast-in 0.25s ease-out' }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
        className={`${s.text} flex-shrink-0 mt-0.5`}>
        {s.icon}
      </svg>
      <span className="text-sm text-molt-text flex-1 leading-snug">{message}</span>
      <button
        onClick={dismiss}
        className="text-molt-muted hover:text-molt-text transition-colors flex-shrink-0 -mt-0.5 -mr-1 p-1 rounded-md hover:bg-white/5"
        aria-label="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </button>
    </div>
  )
}

function NotificationToast() {
  const notifications = useStore((s) => s.notifications)

  if (notifications.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className="fixed bottom-12 right-4 z-[60] space-y-2 pointer-events-none">
        {notifications.slice(-5).map((n) => (
          <div key={n.id} className="pointer-events-auto">
            <Toast id={n.id} message={n.message} type={n.type} timestamp={n.timestamp} />
          </div>
        ))}
      </div>
    </>
  )
}

function SubmoltSyncModal({ onClose }: { onClose: () => void }) {
  const { syncStatus, setActivePanel } = useStore()
  const [dontRemind, setDontRemind] = useState(false)

  const handleSync = () => {
    invoke(IPC.SUBMOLTS_CACHE_SYNC, { force: false }).catch(() => {})
  }

  const handleLater = () => {
    if (dontRemind) {
      // Persist the preference so the modal never shows again
      invoke(IPC.SETTINGS_SAVE_PREFERENCES, { suppress_sync_prompt: true }).catch(() => {})
    }
    onClose()
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

        {syncStatus.syncing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                className="animate-spin text-molt-accent shrink-0" strokeLinecap="round">
                <path d="M14 8A6 6 0 112.5 5.5" />
              </svg>
              <span className="text-xs text-molt-muted">{syncStatus.phase}</span>
            </div>
            {syncStatus.total > 0 && (
              <div className="w-full h-1.5 bg-molt-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-molt-accent rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((syncStatus.cached / syncStatus.total) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 pt-1">
          {!syncStatus.syncing && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dontRemind}
                onChange={(e) => setDontRemind(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-molt-border accent-molt-accent"
              />
              <span className="text-xs text-molt-muted">Don't remind me, I will run it manually</span>
            </label>
          )}

          <div className="flex justify-end gap-2">
            {!syncStatus.syncing ? (
              <>
                <button onClick={handleLater} className="btn-secondary text-sm px-4 py-2">Later</button>
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
    </div>
  )
}

export function App() {
  useKeyboard()
  useAutopilotEvents()
  useTheme()
  const { setConnectionStatus, setSyncStatus } = useStore()
  const [showSyncModal, setShowSyncModal] = useState(false)

  // Global listener for submolt sync status — keeps store updated even after modal is dismissed
  useEffect(() => {
    return on(IPC.SUBMOLTS_CACHE_STATUS, (s: unknown) => {
      const data = s as { syncing: boolean; cached: number; total: number; phase: string }
      setSyncStatus(data)
    })
  }, [setSyncStatus])

  // Auto-test Moltbook connection on startup, then check submolt cache
  useEffect(() => {
    let ignore = false
    invoke<{ result: { valid: boolean; provider: string } }>(IPC.SETTINGS_TEST_CONNECTION, { provider: 'moltbook' })
      .then((res) => {
        if (ignore) return
        setConnectionStatus('moltbook', res.result.valid)
        // If connected, check if submolts are cached and if user hasn't suppressed the prompt
        if (res.result.valid) {
          Promise.all([
            invoke<{ total_cached: number }>(IPC.SUBMOLTS_SEARCH_CACHED, { keyword: '', limit: 1 }),
            invoke<any>(IPC.SETTINGS_GET_ALL, {})
          ]).then(([cacheResp, settingsResp]) => {
            if (ignore) return
            const totalCached = cacheResp?.total_cached ?? 0
            const prefs = settingsResp?.preferences ?? settingsResp
            const suppressed = !!(prefs?.suppress_sync_prompt)
            if (totalCached === 0 && !suppressed) {
              setShowSyncModal(true)
            }
          }).catch(() => {})
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
