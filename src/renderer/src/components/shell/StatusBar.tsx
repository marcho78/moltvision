import React, { useEffect, useState } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

export function StatusBar() {
  const { autopilotStatus, activeLlm, connectionStatuses, syncStatus } = useStore()
  const [todayTokens, setTodayTokens] = useState<{ input: number; output: number } | null>(null)

  // Fetch today's token usage on mount and every 30s
  useEffect(() => {
    const fetch = () => {
      invoke<any>(IPC.ANALYTICS_TOKEN_USAGE)
        .then((stats) => setTodayTokens(stats?.today ?? { input: 0, output: 0 }))
        .catch(() => {})
    }
    fetch()
    const interval = setInterval(fetch, 30000)
    return () => clearInterval(interval)
  }, [])

  const modeColors: Record<string, string> = {
    off: 'bg-molt-muted',
    'semi-auto': 'bg-molt-warning',
    autopilot: 'bg-molt-success'
  }

  const modeLabels: Record<string, string> = {
    off: 'Off',
    'semi-auto': 'Semi-Auto',
    autopilot: 'Autopilot'
  }

  return (
    <div className="h-6 bg-molt-bg border-t border-molt-border flex items-center px-3 text-[11px] text-molt-muted gap-4 select-none">
      {/* Connection */}
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${connectionStatuses.moltbook ? 'bg-molt-success' : 'bg-molt-error'}`} />
        <span>Moltbook</span>
      </div>

      {/* Autopilot mode */}
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${modeColors[autopilotStatus.mode]}`} />
        <span>{modeLabels[autopilotStatus.mode]}</span>
        {autopilotStatus.emergency_stopped && (
          <span className="text-molt-error font-bold">STOPPED</span>
        )}
      </div>

      {/* Actions today */}
      <span>Actions: {autopilotStatus.actions_today}/day</span>

      {/* Active LLM */}
      <div className="flex items-center gap-1.5">
        <span>LLM: {activeLlm}</span>
      </div>

      {/* Token usage today */}
      {todayTokens && (todayTokens.input > 0 || todayTokens.output > 0) && (
        <div className="flex items-center gap-1 text-molt-muted" title="Tokens used today (input / output)">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="opacity-60">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.5 3v4.5l3 1.5-.5 1-3.5-1.75V4h1z" />
          </svg>
          <span>{formatTokens(todayTokens.input + todayTokens.output)}</span>
        </div>
      )}

      {/* Submolt sync status */}
      {syncStatus.syncing && (
        <div className="flex items-center gap-1.5 text-molt-accent">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
            className="animate-spin shrink-0" strokeLinecap="round">
            <path d="M14 8A6 6 0 112.5 5.5" />
          </svg>
          <span>
            {syncStatus.total > 0
              ? `Syncing: ${syncStatus.cached.toLocaleString()}/${syncStatus.total.toLocaleString()}`
              : syncStatus.phase}
          </span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Keyboard shortcut hint */}
      <span className="opacity-60">Ctrl+K: Commands</span>
    </div>
  )
}
