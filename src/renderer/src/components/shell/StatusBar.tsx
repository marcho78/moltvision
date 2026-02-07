import React from 'react'
import { useStore } from '../../stores'

export function StatusBar() {
  const { autopilotStatus, activeLlm, connectionStatuses } = useStore()

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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Keyboard shortcut hint */}
      <span className="opacity-60">Ctrl+K: Commands</span>
    </div>
  )
}
