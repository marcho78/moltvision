import React from 'react'
import logo from '../../assets/moltvision.png'

export function TitleBar() {
  return (
    <div className="h-8 bg-molt-bg border-b border-molt-border flex items-center justify-between drag-region select-none">
      <div className="flex items-center gap-2 pl-3 no-drag">
        <img src={logo} alt="MoltVision" className="w-4 h-4 rounded-sm" />
        <span className="text-xs font-semibold text-molt-text tracking-wide">MoltVision</span>
      </div>
      <div className="flex no-drag">
        <button
          onClick={() => window.molt.windowMinimize()}
          className="px-4 h-8 hover:bg-molt-surface text-molt-muted hover:text-molt-text transition-colors"
          aria-label="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={() => window.molt.windowMaximize()}
          className="px-4 h-8 hover:bg-molt-surface text-molt-muted hover:text-molt-text transition-colors"
          aria-label="Maximize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        </button>
        <button
          onClick={() => window.molt.windowClose()}
          className="px-4 h-8 hover:bg-molt-error text-molt-muted hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>
    </div>
  )
}
