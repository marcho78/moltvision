import React, { useEffect, useState } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { PanelId, Submolt } from '@shared/domain.types'

interface SidebarItemDef {
  id: PanelId
  label: string
  icon: string
}

const ITEMS_BEFORE: SidebarItemDef[] = [
  { id: 'feed', label: 'Feed', icon: '📡' },
  { id: 'galaxy', label: 'Galaxy Map', icon: '🌌' },
  { id: 'network', label: 'Agent Network', icon: '🕸' },
]

const ITEMS_AFTER: SidebarItemDef[] = [
  { id: 'conversation', label: 'Conversations', icon: '💬' },
  { id: 'persona', label: 'Persona Studio', icon: '🎭' },
  { id: 'search', label: 'Search Explorer', icon: '🔍' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'autopilot', label: 'Autopilot', icon: '🤖' },
  { id: 'moderation', label: 'Moderation', icon: '🛡' },
  { id: 'settings', label: 'Settings', icon: '⚙' }
]

export function Sidebar() {
  const activePanel = useStore((s) => s.activePanel)
  const setActivePanel = useStore((s) => s.setActivePanel)
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const submolts = useStore((s) => s.submolts)
  const setSubmolts = useStore((s) => s.setSubmolts)
  const setSelectedSubmolt = useStore((s) => s.setSelectedSubmolt)
  const addNotification = useStore((s) => s.addNotification)

  const [subsOpen, setSubsOpen] = useState(true)
  const [unsubscribing, setUnsubscribing] = useState<string | null>(null)

  // Fetch submolts on mount
  useEffect(() => {
    let ignore = false
    invoke<any>(IPC.SUBMOLTS_LIST)
      .then((data) => {
        if (ignore) return
        const list = data?.submolts ?? data ?? []
        if (Array.isArray(list) && list.length > 0) {
          const normalized: Submolt[] = list.map((s: any) => ({
            id: s.id ?? s.name,
            name: s.name,
            display_name: s.display_name ?? s.name,
            description: s.description ?? '',
            theme_color: s.theme_color ?? '#7c5cfc',
            subscriber_count: s.subscriber_count ?? s.subscribers ?? 0,
            post_count: s.post_count ?? 0,
            is_subscribed: s.is_subscribed ?? false,
            moderators: s.moderators ?? [],
            rules: s.rules ?? [],
            your_role: s.your_role ?? null,
            created_at: s.created_at ?? ''
          }))
          setSubmolts(normalized)
        }
      })
      .catch(() => {})
    return () => { ignore = true }
  }, [])

  const subscribed = submolts.filter((s) => s.is_subscribed)

  const handleSubmoltClick = (name: string) => {
    setSelectedSubmolt(name)
    setActivePanel('feed')
  }

  const handleUnsubscribe = async (e: React.MouseEvent, sub: Submolt) => {
    e.stopPropagation()
    setUnsubscribing(sub.id)
    try {
      await invoke(IPC.SUBMOLTS_UNSUBSCRIBE, { submolt_name: sub.name })
      setSubmolts(
        submolts.map((s) =>
          s.id === sub.id
            ? { ...s, is_subscribed: false, subscriber_count: Math.max(0, s.subscriber_count - 1) }
            : s
        )
      )
      addNotification(`Unsubscribed from ${sub.display_name || sub.name}`, 'info')
    } catch {
      addNotification('Failed to unsubscribe', 'error')
    } finally {
      setUnsubscribing(null)
    }
  }

  return (
    <div
      className={`flex flex-col bg-molt-bg border-r border-molt-border transition-all duration-200 ${
        sidebarCollapsed ? 'w-14' : 'w-48'
      }`}
    >
      <div className="flex items-center justify-end p-2">
        <button
          onClick={toggleSidebar}
          className="text-molt-muted hover:text-molt-text p-1 rounded transition-colors"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            {sidebarCollapsed ? (
              <polyline points="6,3 11,8 6,13" />
            ) : (
              <polyline points="10,3 5,8 10,13" />
            )}
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {/* Feed, Galaxy Map, Agent Network */}
        {ITEMS_BEFORE.map((item) => (
          <SidebarItem
            key={item.id}
            item={item}
            active={activePanel === item.id}
            collapsed={sidebarCollapsed}
            onClick={() => setActivePanel(item.id)}
          />
        ))}

        {/* Subscriptions tree */}
        <div>
          <button
            onClick={() => setSubsOpen(!subsOpen)}
            className="sidebar-item w-full"
            title={sidebarCollapsed ? 'Subscriptions' : undefined}
          >
            <span className="text-base flex-shrink-0">📌</span>
            {!sidebarCollapsed && (
              <>
                <span className="text-sm truncate flex-1">Subscriptions</span>
                <svg
                  width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
                  className={`flex-shrink-0 transition-transform ${subsOpen ? 'rotate-90' : ''}`}
                >
                  <polyline points="4,2 8,6 4,10" />
                </svg>
              </>
            )}
          </button>

          {subsOpen && !sidebarCollapsed && (
            <div className="ml-4 border-l border-molt-border/50 pl-1 space-y-0.5 mt-0.5">
              {subscribed.length === 0 ? (
                <div className="text-[10px] text-molt-muted px-2 py-1.5 italic">
                  None yet
                </div>
              ) : (
                subscribed.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => handleSubmoltClick(sub.name)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-molt-surface transition-colors group"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: sub.theme_color || '#7c5cfc' }}
                    />
                    <span className="text-xs text-molt-text truncate flex-1">
                      {sub.display_name || sub.name}
                    </span>
                    <button
                      onClick={(e) => handleUnsubscribe(e, sub)}
                      disabled={unsubscribing === sub.id}
                      className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-molt-muted hover:text-molt-error hover:bg-molt-error/10 text-[10px] transition-all flex-shrink-0"
                      title={`Unsubscribe from ${sub.name}`}
                    >
                      {unsubscribing === sub.id ? '...' : '\u00d7'}
                    </button>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Collapsed: show color dots */}
          {subsOpen && sidebarCollapsed && subscribed.length > 0 && (
            <div className="flex flex-col items-center gap-1 mt-1">
              {subscribed.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => handleSubmoltClick(sub.name)}
                  className="w-3 h-3 rounded-full hover:ring-2 ring-molt-accent transition-all"
                  style={{ backgroundColor: sub.theme_color || '#7c5cfc' }}
                  title={`m/${sub.name}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Rest of menu items */}
        {ITEMS_AFTER.map((item) => (
          <SidebarItem
            key={item.id}
            item={item}
            active={activePanel === item.id}
            collapsed={sidebarCollapsed}
            onClick={() => setActivePanel(item.id)}
          />
        ))}
      </nav>
    </div>
  )
}

function SidebarItem({
  item,
  active,
  collapsed,
  onClick
}: {
  item: SidebarItemDef
  active: boolean
  collapsed: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`sidebar-item w-full ${active ? 'sidebar-item-active' : ''}`}
      title={collapsed ? item.label : undefined}
    >
      <span className="text-base flex-shrink-0">{item.icon}</span>
      {!collapsed && <span className="text-sm truncate">{item.label}</span>}
    </button>
  )
}
