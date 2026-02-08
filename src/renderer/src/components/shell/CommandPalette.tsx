import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../../stores'
import type { PanelId } from '@shared/domain.types'

interface Command {
  id: string
  label: string
  shortcut?: string
  action: () => void
}

export function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette, setActivePanel } = useStore()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const commands: Command[] = [
    { id: 'feed', label: 'Go to Feed', action: () => setActivePanel('feed') },
    { id: 'galaxy', label: 'Go to Galaxy Map', action: () => setActivePanel('galaxy') },
    { id: 'network', label: 'Go to Agent Network', action: () => setActivePanel('network') },
    { id: 'conversation', label: 'Go to Conversations', action: () => setActivePanel('conversation') },
    { id: 'persona', label: 'Go to Persona Studio', action: () => setActivePanel('persona') },
    { id: 'search', label: 'Go to Search Explorer', action: () => setActivePanel('search') },
    { id: 'analytics', label: 'Go to Analytics', action: () => setActivePanel('analytics') },
    { id: 'autopilot', label: 'Go to Autopilot', action: () => setActivePanel('autopilot') },
    { id: 'moderation', label: 'Go to Moderation', action: () => setActivePanel('moderation') },
    { id: 'help', label: 'Go to Help', action: () => setActivePanel('help') },
    { id: 'about', label: 'Go to About', action: () => setActivePanel('about') },
    { id: 'settings', label: 'Go to Settings', action: () => setActivePanel('settings') }
  ]

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  if (!commandPaletteOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-24"
      onClick={toggleCommandPalette}
    >
      <div
        className="w-[500px] bg-molt-surface border border-molt-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command..."
          className="w-full px-4 py-3 bg-transparent text-molt-text border-b border-molt-border
                     focus:outline-none placeholder:text-molt-muted text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Escape') toggleCommandPalette()
            if (e.key === 'Enter' && filtered.length > 0) {
              filtered[0].action()
              toggleCommandPalette()
            }
          }}
        />
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => {
                cmd.action()
                toggleCommandPalette()
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-molt-text hover:bg-molt-accent/10 flex items-center justify-between"
            >
              <span>{cmd.label}</span>
              {cmd.shortcut && <span className="text-molt-muted text-xs">{cmd.shortcut}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-molt-muted text-sm">No commands found</div>
          )}
        </div>
      </div>
    </div>
  )
}
