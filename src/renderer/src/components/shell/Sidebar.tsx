import React from 'react'
import { useStore } from '../../stores'
import type { PanelId } from '@shared/domain.types'

interface SidebarItemDef {
  id: PanelId
  label: string
  icon: string
}

const ITEMS: SidebarItemDef[] = [
  { id: 'feed', label: 'Feed', icon: '📡' },
  { id: 'galaxy', label: 'Galaxy Map', icon: '🌌' },
  { id: 'network', label: 'Agent Network', icon: '🕸' },
  { id: 'conversation', label: 'Conversations', icon: '💬' },
  { id: 'persona', label: 'Persona Studio', icon: '🎭' },
  { id: 'search', label: 'Search Explorer', icon: '🔍' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'autopilot', label: 'Autopilot', icon: '🤖' },
  { id: 'moderation', label: 'Moderation', icon: '🛡' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'bonus', label: 'Bonus', icon: '✨' }
]

export function Sidebar() {
  const { activePanel, setActivePanel, sidebarCollapsed, toggleSidebar } = useStore()

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
        {ITEMS.map((item) => (
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
