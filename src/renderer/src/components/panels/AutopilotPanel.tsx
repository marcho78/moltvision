import React, { useEffect, useCallback } from 'react'
import { useStore } from '../../stores'
import { useAutopilotEvents } from '../../hooks/useAutopilotEvents'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { OperationMode, AgentAction } from '@shared/domain.types'

function ModeToggle() {
  const { autopilotStatus, setAutopilotStatus, addNotification } = useStore()
  const modes: OperationMode[] = ['off', 'semi-auto', 'autopilot']
  const modeInfo: Record<OperationMode, { label: string; color: string; desc: string }> = {
    off: { label: 'Off', color: 'bg-molt-muted', desc: 'Agent is idle' },
    'semi-auto': { label: 'Semi-Auto', color: 'bg-molt-warning', desc: 'Proposes actions for your approval' },
    autopilot: { label: 'Autopilot', color: 'bg-molt-success', desc: 'Fully autonomous within safety limits' }
  }

  const handleSetMode = async (mode: OperationMode) => {
    try {
      const status = await invoke<any>(IPC.AUTOPILOT_SET_MODE, { mode })
      setAutopilotStatus(status)
    } catch (err: any) {
      addNotification(err.message || 'Failed to set mode', 'error')
    }
  }

  return (
    <div className="panel-card">
      <h3 className="text-sm font-medium mb-3">Operation Mode</h3>
      <div className="flex gap-2">
        {modes.map((mode) => {
          const info = modeInfo[mode]
          return (
            <button key={mode} onClick={() => handleSetMode(mode)}
              className={`flex-1 p-3 rounded-lg border transition-colors text-left ${
                autopilotStatus.mode === mode
                  ? 'border-molt-accent bg-molt-accent/10'
                  : 'border-molt-border hover:border-molt-accent/30'
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${info.color}`} />
                <span className="text-sm font-medium">{info.label}</span>
              </div>
              <p className="text-xs text-molt-muted">{info.desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ActionQueueItem({ action }: { action: AgentAction }) {
  const { removeFromQueue, addNotification } = useStore()

  const handleApprove = async () => {
    try {
      await invoke(IPC.AUTOPILOT_APPROVE, { action_id: action.id })
      removeFromQueue(action.id)
      addNotification('Action approved and executing', 'success')
    } catch (err: any) {
      addNotification(err.message || 'Approve failed', 'error')
    }
  }

  const handleReject = async () => {
    try {
      await invoke(IPC.AUTOPILOT_REJECT, { action_id: action.id })
      removeFromQueue(action.id)
    } catch (err: any) {
      addNotification(err.message || 'Reject failed', 'error')
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'text-molt-warning',
    approved: 'text-molt-info',
    executing: 'text-molt-accent',
    completed: 'text-molt-success',
    failed: 'text-molt-error',
    rejected: 'text-molt-muted'
  }

  return (
    <div className="panel-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="badge bg-molt-accent/20 text-molt-accent text-xs">{action.payload.type}</span>
          <span className={`text-xs ${statusColors[action.status]}`}>{action.status}</span>
        </div>
        <span className="text-xs text-molt-muted">
          {new Date(action.created_at).toLocaleTimeString()}
        </span>
      </div>
      {action.payload.content && (
        <p className="text-xs text-molt-text mb-2 line-clamp-3">{action.payload.content}</p>
      )}
      <p className="text-xs text-molt-muted mb-2">{action.reasoning}</p>
      {action.status === 'pending' && (
        <div className="flex gap-2">
          <button onClick={handleApprove} className="btn-primary text-xs py-1 px-3">Approve</button>
          <button onClick={handleReject} className="btn-danger text-xs py-1 px-3">Reject</button>
        </div>
      )}
    </div>
  )
}

function EmergencyStop() {
  const { autopilotStatus, setAutopilotStatus, addNotification } = useStore()

  const handleStop = async () => {
    try {
      const status = await invoke<any>(IPC.AUTOPILOT_EMERGENCY_STOP)
      setAutopilotStatus(status)
      addNotification('EMERGENCY STOP activated!', 'warning')
    } catch (err: any) {
      addNotification(err.message || 'Emergency stop failed', 'error')
    }
  }

  return (
    <button onClick={handleStop}
      disabled={autopilotStatus.mode === 'off'}
      className="w-full py-4 rounded-xl bg-molt-error/20 hover:bg-molt-error/40 border-2 border-molt-error
                 text-molt-error font-bold text-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
      EMERGENCY STOP
    </button>
  )
}

export function AutopilotPanel() {
  const { autopilotStatus, actionQueue, setActionQueue } = useStore()
  useAutopilotEvents()

  useEffect(() => {
    invoke<{ actions: AgentAction[] }>(IPC.AUTOPILOT_GET_QUEUE, {})
      .then((result) => setActionQueue(result.actions))
      .catch(console.error)
  }, [setActionQueue])

  const pendingCount = actionQueue.filter((a) => a.status === 'pending').length

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border">
        <h2 className="text-lg font-semibold">Autopilot Controls</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ModeToggle />

        <div className="grid grid-cols-3 gap-3">
          <div className="panel-card p-3 text-center">
            <div className="text-xs text-molt-muted">Actions/Hour</div>
            <div className="text-xl font-bold text-molt-text">{autopilotStatus.actions_this_hour}</div>
          </div>
          <div className="panel-card p-3 text-center">
            <div className="text-xs text-molt-muted">Actions Today</div>
            <div className="text-xl font-bold text-molt-text">{autopilotStatus.actions_today}</div>
          </div>
          <div className="panel-card p-3 text-center">
            <div className="text-xs text-molt-muted">Pending</div>
            <div className="text-xl font-bold text-molt-warning">{pendingCount}</div>
          </div>
        </div>

        <EmergencyStop />

        <div>
          <h3 className="text-sm font-medium mb-2">Action Queue ({actionQueue.length})</h3>
          <div className="space-y-2">
            {actionQueue.length === 0 ? (
              <div className="text-molt-muted text-sm text-center py-4">No queued actions</div>
            ) : (
              actionQueue.map((action) => <ActionQueueItem key={action.id} action={action} />)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
