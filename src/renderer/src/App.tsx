import React from 'react'
import { TitleBar } from './components/shell/TitleBar'
import { Sidebar } from './components/shell/Sidebar'
import { PanelContainer } from './components/shell/PanelContainer'
import { StatusBar } from './components/shell/StatusBar'
import { CommandPalette } from './components/shell/CommandPalette'
import { useKeyboard } from './hooks/useKeyboard'
import { useAutopilotEvents } from './hooks/useAutopilotEvents'
import { useStore } from './stores'

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

export function App() {
  useKeyboard()
  useAutopilotEvents()

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
    </div>
  )
}
