import React, { useEffect, useState } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'

export function ModerationPanel() {
  const { submolts, modSelectedSubmolt, setModSelectedSubmolt, addNotification } = useStore()
  const [modLog, setModLog] = useState<any[]>([])
  const [pinnedPosts, setPinnedPosts] = useState<string[]>([])

  useEffect(() => {
    if (!modSelectedSubmolt) return
    invoke<{ moderators: any[] }>(IPC.MOD_GET_MODS, { submolt_name: modSelectedSubmolt })
      .then((result) => setModLog(result.moderators ?? []))
      .catch(console.error)
  }, [modSelectedSubmolt])

  const handlePin = async (postId: string) => {
    if (!modSelectedSubmolt) return
    try {
      await invoke(IPC.MOD_PIN, { post_id: postId })
      addNotification('Post pinned', 'success')
    } catch (err: any) {
      addNotification(err.message || 'Pin failed', 'error')
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border">
        <h2 className="text-lg font-semibold">Moderation Dashboard</h2>
      </div>
      <div className="flex-1 flex">
        {/* Submolt selector */}
        <div className="w-48 border-r border-molt-border overflow-y-auto p-2">
          <h3 className="text-xs text-molt-muted px-2 mb-2 uppercase tracking-wider">Submolts</h3>
          {submolts.map((s) => (
            <button key={s.id} onClick={() => setModSelectedSubmolt(s.name)}
              className={`w-full text-left px-3 py-2 rounded text-sm ${
                modSelectedSubmolt === s.name ? 'bg-molt-accent/10 text-molt-accent' : 'text-molt-muted hover:bg-molt-surface'
              }`}>
              {s.name}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!modSelectedSubmolt ? (
            <div className="text-molt-muted text-center mt-12">Select a submolt to moderate</div>
          ) : (
            <div className="space-y-6">
              {/* Pin manager */}
              <div className="panel-card">
                <h3 className="text-sm font-medium mb-3">Pin Manager</h3>
                <div className="flex gap-2">
                  <input placeholder="Post ID to pin..." className="input-field flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handlePin((e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = ''
                      }
                    }} />
                </div>
              </div>

              {/* Mod log */}
              <div className="panel-card">
                <h3 className="text-sm font-medium mb-3">Moderation Log</h3>
                {modLog.length === 0 ? (
                  <p className="text-molt-muted text-sm">No moderation log entries</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {modLog.map((entry: any) => (
                      <div key={entry.id} className="flex items-center gap-2 text-xs py-1 border-b border-molt-border/50">
                        <span className="badge bg-molt-surface text-molt-muted">{entry.action}</span>
                        <span className="text-molt-text">{entry.moderator}</span>
                        <span className="text-molt-muted flex-1 truncate">{entry.reason}</span>
                        <span className="text-molt-muted">{new Date(entry.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
