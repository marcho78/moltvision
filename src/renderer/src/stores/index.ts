import { create } from 'zustand'
import type {
  PanelId, Post, Comment, AgentProfile, Submolt, AgentAction,
  AgentPersona, AutopilotStatus, ChatResponse, KarmaSnapshot,
  ActivityLogEntry, RateLimitState, GalaxyNode, GalaxyEdge,
  NetworkNode, NetworkEdge, SearchResult, SearchCluster,
  UserPreferences, ApiKeyStatus, SortOrder, FeedSource, OperationMode,
  LLMProviderName, VoteDirection, AgentEngagement, ReplyInboxEntry,
  ThemePresetId, ThemeColors
} from '@shared/domain.types'

// --- UI Slice ---
interface UISlice {
  activePanel: PanelId
  sidebarCollapsed: boolean
  theme: ThemePresetId | 'custom'
  themeCustomColors: ThemeColors | null
  commandPaletteOpen: boolean
  notifications: Array<{ id: string; message: string; type: 'info' | 'success' | 'warning' | 'error'; timestamp: number }>
  setActivePanel: (panel: PanelId) => void
  toggleSidebar: () => void
  setTheme: (theme: ThemePresetId | 'custom') => void
  setThemeCustomColors: (colors: ThemeColors | null) => void
  toggleCommandPalette: () => void
  addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  dismissNotification: (id: string) => void
}

// --- Feed Slice ---
type FeedView = 'compact' | 'card'

interface FeedSlice {
  posts: Post[]
  sortOrder: SortOrder
  feedSource: FeedSource
  selectedSubmolt: string | null
  nextOffset: number | null
  hasMore: boolean
  loading: boolean
  feedView: FeedView
  savedPostIds: Set<string>
  setPosts: (posts: Post[], nextOffset?: number | null, hasMore?: boolean) => void
  appendPosts: (posts: Post[], nextOffset: number | null, hasMore: boolean) => void
  setSortOrder: (sort: SortOrder) => void
  setFeedSource: (source: FeedSource) => void
  setSelectedSubmolt: (submoltId: string | null) => void
  setFeedLoading: (loading: boolean) => void
  setFeedView: (view: FeedView) => void
  updatePostVote: (postId: string, direction: VoteDirection, newKarma: number) => void
  setSavedPostIds: (ids: string[]) => void
  toggleSavedPost: (postId: string, saved: boolean) => void
}

// --- Agents Slice ---
interface AgentsSlice {
  agents: AgentProfile[]
  networkNodes: NetworkNode[]
  networkEdges: NetworkEdge[]
  selectedAgent: AgentProfile | null
  setAgents: (agents: AgentProfile[]) => void
  setNetworkData: (nodes: NetworkNode[], edges: NetworkEdge[]) => void
  setSelectedAgent: (agent: AgentProfile | null) => void
}

// --- Submolts Slice ---
interface SyncStatus {
  syncing: boolean
  cached: number
  total: number
  phase: string
}

interface SubmoltsSlice {
  submolts: Submolt[]
  galaxyNodes: GalaxyNode[]
  galaxyEdges: GalaxyEdge[]
  selectedSubmoltDetail: Submolt | null
  syncStatus: SyncStatus
  setSubmolts: (submolts: Submolt[]) => void
  setGalaxyData: (nodes: GalaxyNode[], edges: GalaxyEdge[]) => void
  setSelectedSubmoltDetail: (submolt: Submolt | null) => void
  setSyncStatus: (status: SyncStatus) => void
}

// --- Conversation Slice ---
type ConversationView = 'thread' | 'tree'

interface ConversationSlice {
  activePostId: string | null
  activePost: Post | null
  comments: Comment[]
  selectedComment: Comment | null
  conversationView: ConversationView
  setActivePost: (postId: string | null) => void
  setActivePostData: (post: Post | null) => void
  setComments: (comments: Comment[]) => void
  setSelectedComment: (comment: Comment | null) => void
  setConversationView: (view: ConversationView) => void
}

// --- Persona Slice ---
interface PersonaSlice {
  activePersona: AgentPersona | null
  savedPersonas: AgentPersona[]
  personaDirty: boolean
  setActivePersona: (persona: AgentPersona | null) => void
  setSavedPersonas: (personas: AgentPersona[]) => void
  setPersonaDirty: (dirty: boolean) => void
}

// --- Search Slice ---
interface SearchSlice {
  searchQuery: string
  searchResults: SearchResult[]
  searchClusters: SearchCluster[]
  searchPoints: Array<{ id: string; x: number; y: number }>
  similarityThreshold: number
  setSearchQuery: (query: string) => void
  setSearchResults: (results: SearchResult[]) => void
  setSearchClusters: (clusters: SearchCluster[], points: Array<{ id: string; x: number; y: number }>) => void
  setSimilarityThreshold: (threshold: number) => void
}

// --- Analytics Slice ---
interface AnalyticsSlice {
  karmaHistory: KarmaSnapshot[]
  activityLog: ActivityLogEntry[]
  rateLimits: RateLimitState[]
  dateRange: number
  setKarmaHistory: (snapshots: KarmaSnapshot[]) => void
  setActivityLog: (entries: ActivityLogEntry[]) => void
  setRateLimits: (limits: RateLimitState[]) => void
  setDateRange: (days: number) => void
}

// --- Autopilot Slice ---
interface LiveEvent {
  type: 'scan' | 'action'
  timestamp: string
  phase?: string
  message?: string
  action_type?: string
  submolt?: string
  post_id?: string
  content?: string
  title?: string
}

interface AutopilotSlice {
  autopilotStatus: AutopilotStatus
  actionQueue: AgentAction[]
  decisionLog: ActivityLogEntry[]
  activePersonaId: string
  agentActivity: AgentEngagement[]
  replyInbox: ReplyInboxEntry[]
  unreadReplyCount: number
  liveEvents: LiveEvent[]
  setAutopilotStatus: (status: AutopilotStatus) => void
  setActionQueue: (actions: AgentAction[]) => void
  setDecisionLog: (entries: ActivityLogEntry[]) => void
  removeFromQueue: (actionId: string) => void
  setActivePersonaId: (id: string) => void
  setAgentActivity: (entries: AgentEngagement[]) => void
  setReplyInbox: (entries: ReplyInboxEntry[]) => void
  setUnreadReplyCount: (count: number) => void
  addLiveEvent: (event: LiveEvent) => void
}

// --- Moderation Slice ---
interface ModerationSlice {
  modSelectedSubmolt: string | null
  pinnedPosts: string[]
  moderators: AgentProfile[]
  setModSelectedSubmolt: (submoltId: string | null) => void
  setPinnedPosts: (postIds: string[]) => void
  setModerators: (mods: AgentProfile[]) => void
}

// --- Settings Slice ---
interface SettingsSlice {
  apiKeys: ApiKeyStatus[]
  activeLlm: LLMProviderName
  connectionStatuses: Record<string, boolean>
  preferences: UserPreferences | null
  setApiKeys: (keys: ApiKeyStatus[]) => void
  setActiveLlm: (llm: LLMProviderName) => void
  setConnectionStatus: (provider: string, connected: boolean) => void
  setPreferences: (prefs: UserPreferences) => void
}

// --- Combined Store ---
export type AppState = UISlice & FeedSlice & AgentsSlice & SubmoltsSlice &
  ConversationSlice & PersonaSlice & SearchSlice & AnalyticsSlice &
  AutopilotSlice & ModerationSlice & SettingsSlice

export const useStore = create<AppState>((set) => ({
  // --- UI ---
  activePanel: 'feed',
  sidebarCollapsed: false,
  theme: 'dark',
  themeCustomColors: null,
  commandPaletteOpen: false,
  notifications: [],
  setActivePanel: (panel) => set({ activePanel: panel }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTheme: (theme) => set({ theme }),
  setThemeCustomColors: (themeCustomColors) => set({ themeCustomColors }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  addNotification: (message, type = 'info') =>
    set((s) => ({
      notifications: [...s.notifications, { id: Date.now().toString(), message, type, timestamp: Date.now() }]
    })),
  dismissNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  // --- Feed ---
  posts: [],
  sortOrder: 'hot',
  feedSource: 'all',
  selectedSubmolt: null,
  nextOffset: null,
  hasMore: false,
  loading: false,
  feedView: 'card',
  savedPostIds: new Set<string>(),
  setPosts: (posts, nextOffset, hasMore) => set({ posts, nextOffset: nextOffset ?? null, hasMore: hasMore ?? false }),
  appendPosts: (posts, nextOffset, hasMore) => set((s) => {
    // Deduplicate by post id
    const existingIds = new Set(s.posts.map((p) => p.id))
    const newPosts = posts.filter((p) => !existingIds.has(p.id))
    return { posts: [...s.posts, ...newPosts], nextOffset, hasMore }
  }),
  setSortOrder: (sortOrder) => set({ sortOrder, posts: [], nextOffset: null, hasMore: false }),
  setFeedSource: (feedSource) => set({ feedSource, posts: [], nextOffset: null, hasMore: false }),
  setSelectedSubmolt: (submoltId) => set((s) => ({
    selectedSubmolt: submoltId,
    feedSource: submoltId ? 'submolt' : s.feedSource === 'submolt' ? 'all' : s.feedSource,
    posts: [], nextOffset: null, hasMore: false
  })),
  setFeedLoading: (loading) => set({ loading }),
  setFeedView: (feedView) => set({ feedView }),
  updatePostVote: (postId, direction, newKarma) =>
    set((s) => ({
      posts: s.posts.map((p) => (p.id === postId ? { ...p, our_vote: direction, karma: newKarma } : p))
    })),
  setSavedPostIds: (ids) => set({ savedPostIds: new Set(ids) }),
  toggleSavedPost: (postId, saved) =>
    set((s) => {
      const next = new Set(s.savedPostIds)
      if (saved) next.add(postId)
      else next.delete(postId)
      return { savedPostIds: next }
    }),

  // --- Agents ---
  agents: [],
  networkNodes: [],
  networkEdges: [],
  selectedAgent: null,
  setAgents: (agents) => set({ agents }),
  setNetworkData: (networkNodes, networkEdges) => set({ networkNodes, networkEdges }),
  setSelectedAgent: (selectedAgent) => set({ selectedAgent }),

  // --- Submolts ---
  submolts: [],
  galaxyNodes: [],
  galaxyEdges: [],
  selectedSubmoltDetail: null,
  syncStatus: { syncing: false, cached: 0, total: 0, phase: '' },
  setSubmolts: (submolts) => set({ submolts }),
  setGalaxyData: (galaxyNodes, galaxyEdges) => set({ galaxyNodes, galaxyEdges }),
  setSelectedSubmoltDetail: (submolt) => set({ selectedSubmoltDetail: submolt }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),

  // --- Conversation ---
  activePostId: null,
  activePost: null,
  comments: [],
  selectedComment: null,
  conversationView: 'thread',
  setActivePost: (activePostId) => set({ activePostId }),
  setActivePostData: (activePost) => set({ activePost }),
  setComments: (comments) => set({ comments }),
  setSelectedComment: (selectedComment) => set({ selectedComment }),
  setConversationView: (conversationView) => set({ conversationView }),

  // --- Persona ---
  activePersona: null,
  savedPersonas: [],
  personaDirty: false,
  setActivePersona: (activePersona) => set({ activePersona, personaDirty: false }),
  setSavedPersonas: (savedPersonas) => set({ savedPersonas }),
  setPersonaDirty: (personaDirty) => set({ personaDirty }),

  // --- Search ---
  searchQuery: '',
  searchResults: [],
  searchClusters: [],
  searchPoints: [],
  similarityThreshold: 0,
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setSearchClusters: (searchClusters, searchPoints) => set({ searchClusters, searchPoints }),
  setSimilarityThreshold: (similarityThreshold) => set({ similarityThreshold }),

  // --- Analytics ---
  karmaHistory: [],
  activityLog: [],
  rateLimits: [],
  dateRange: 30,
  setKarmaHistory: (karmaHistory) => set({ karmaHistory }),
  setActivityLog: (activityLog) => set({ activityLog }),
  setRateLimits: (rateLimits) => set({ rateLimits }),
  setDateRange: (dateRange) => set({ dateRange }),

  // --- Autopilot ---
  autopilotStatus: {
    mode: 'off', is_running: false, last_scan_at: null,
    actions_this_hour: 0, actions_today: 0, next_scan_at: null, emergency_stopped: false
  },
  actionQueue: [],
  decisionLog: [],
  activePersonaId: 'default',
  agentActivity: [],
  replyInbox: [],
  unreadReplyCount: 0,
  liveEvents: [],
  setAutopilotStatus: (autopilotStatus) => set({ autopilotStatus }),
  setActionQueue: (actionQueue) => set({ actionQueue }),
  setDecisionLog: (decisionLog) => set({ decisionLog }),
  removeFromQueue: (actionId) =>
    set((s) => ({ actionQueue: s.actionQueue.filter((a) => a.id !== actionId) })),
  setActivePersonaId: (activePersonaId) => set({ activePersonaId }),
  setAgentActivity: (agentActivity) => set({ agentActivity }),
  setReplyInbox: (replyInbox) => set({ replyInbox }),
  setUnreadReplyCount: (unreadReplyCount) => set({ unreadReplyCount }),
  addLiveEvent: (event) => set((s) => ({
    liveEvents: [event, ...s.liveEvents].slice(0, 50) // keep last 50 events
  })),

  // --- Moderation ---
  modSelectedSubmolt: null,
  pinnedPosts: [],
  moderators: [],
  setModSelectedSubmolt: (modSelectedSubmolt) => set({ modSelectedSubmolt }),
  setPinnedPosts: (pinnedPosts) => set({ pinnedPosts }),
  setModerators: (moderators) => set({ moderators }),

  // --- Settings ---
  apiKeys: [],
  activeLlm: 'claude',
  connectionStatuses: {},
  preferences: null,
  setApiKeys: (apiKeys) => set({ apiKeys }),
  setActiveLlm: (activeLlm) => set({ activeLlm }),
  setConnectionStatus: (provider, connected) =>
    set((s) => ({ connectionStatuses: { ...s.connectionStatuses, [provider]: connected } })),
  setPreferences: (preferences) => set({
    preferences,
    theme: preferences.theme,
    themeCustomColors: preferences.theme_custom_colors ?? null
  }),

}))
