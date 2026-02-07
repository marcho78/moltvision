import React, { Component, Suspense, lazy } from 'react'
import { useStore } from '../../stores'
import type { PanelId } from '@shared/domain.types'

// --- Error Boundary: catches React render crashes and shows the error ---
class PanelErrorBoundary extends Component<
  { children: React.ReactNode; panelKey: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PanelErrorBoundary] Caught render crash:', error, info.componentStack)
  }

  componentDidUpdate(prevProps: { panelKey: string }) {
    if (prevProps.panelKey !== this.props.panelKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="max-w-lg text-center space-y-4">
            <div className="text-4xl">!</div>
            <h2 className="text-lg font-semibold text-molt-text">Panel crashed</h2>
            <pre className="text-left text-xs text-molt-error bg-molt-surface p-4 rounded-lg overflow-auto max-h-48 border border-molt-border">
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 bg-molt-accent text-white rounded-lg text-sm hover:bg-molt-accent/80"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const LiveFeedPanel = lazy(() => import('../panels/LiveFeedPanel').then(m => ({ default: m.LiveFeedPanel })))
const GalaxyMapPanel = lazy(() => import('../panels/GalaxyMapPanel').then(m => ({ default: m.GalaxyMapPanel })))
const AgentNetworkPanel = lazy(() => import('../panels/AgentNetworkPanel').then(m => ({ default: m.AgentNetworkPanel })))
const ConversationPanel = lazy(() => import('../panels/ConversationPanel').then(m => ({ default: m.ConversationPanel })))
const PersonaStudioPanel = lazy(() => import('../panels/PersonaStudioPanel').then(m => ({ default: m.PersonaStudioPanel })))
const SearchExplorerPanel = lazy(() => import('../panels/SearchExplorerPanel').then(m => ({ default: m.SearchExplorerPanel })))
const AnalyticsPanel = lazy(() => import('../panels/AnalyticsPanel').then(m => ({ default: m.AnalyticsPanel })))
const AutopilotPanel = lazy(() => import('../panels/AutopilotPanel').then(m => ({ default: m.AutopilotPanel })))
const ModerationPanel = lazy(() => import('../panels/ModerationPanel').then(m => ({ default: m.ModerationPanel })))
const SettingsPanel = lazy(() => import('../panels/SettingsPanel').then(m => ({ default: m.SettingsPanel })))
const BonusPanel = lazy(() => import('../panels/BonusPanel').then(m => ({ default: m.BonusPanel })))

const PANEL_MAP: Record<PanelId, React.LazyExoticComponent<React.ComponentType>> = {
  feed: LiveFeedPanel,
  galaxy: GalaxyMapPanel,
  network: AgentNetworkPanel,
  conversation: ConversationPanel,
  persona: PersonaStudioPanel,
  search: SearchExplorerPanel,
  analytics: AnalyticsPanel,
  autopilot: AutopilotPanel,
  moderation: ModerationPanel,
  settings: SettingsPanel,
  bonus: BonusPanel
}

function PanelFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-molt-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-molt-muted text-sm">Loading panel...</span>
      </div>
    </div>
  )
}

export function PanelContainer() {
  const activePanel = useStore((s) => s.activePanel)
  const Panel = PANEL_MAP[activePanel]

  return (
    <div className="flex-1 overflow-hidden bg-molt-bg">
      <PanelErrorBoundary panelKey={activePanel}>
        <Suspense fallback={<PanelFallback />}>
          <Panel />
        </Suspense>
      </PanelErrorBoundary>
    </div>
  )
}
