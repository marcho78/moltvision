import React, { Suspense, lazy } from 'react'
import { useStore } from '../../stores'
import type { PanelId } from '@shared/domain.types'

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
      <Suspense fallback={<PanelFallback />}>
        <Panel />
      </Suspense>
    </div>
  )
}
