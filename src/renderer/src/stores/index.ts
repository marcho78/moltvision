import { create } from 'zustand'
import type {
  PanelId, Post, Comment, AgentProfile, Submolt, AgentAction,
  AgentPersona, AutopilotStatus, ChatResponse, KarmaSnapshot,
  ActivityLogEntry, RateLimitState, GalaxyNode, GalaxyEdge,
  NetworkNode, NetworkEdge, SearchResult, SearchCluster,
  UserPreferences, ApiKeyStatus, MoodData, TrendItem,
  Rivalry, KarmaForecast, PostIdea, SortOrder, OperationMode,
  LLMProviderName, VoteDirection
} from '@shared/domain.types'

// --- UI Slice ---
interface UISlice {
  activePanel: PanelId
  sidebarCollapsed: boolean
  theme: 'dark' | 'light'
  commandPaletteOpen: boolean
  notifications: Array<{ id: string; message: string; type: 'info' | 'success' | 'warning' | 'error'; timestamp: number }>
  setActivePanel: (panel: PanelId) => void
  toggleSidebar: () => void
  setTheme: (theme: 'dark' | 'light') => void
  toggleCommandPalette: () => void
  addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  dismissNotification: (id: string) => void
}

// --- Feed Slice ---
interface FeedSlice {
  posts: Post[]
  sortOrder: SortOrder
  selectedSubmolt: string | null
  cursor: string | null
  loading: boolean
  setPosts: (posts: Post[]) => void
  appendPosts: (posts: Post[], cursor: string | null) => void
  setSortOrder: (sort: SortOrder) => void
  setSelectedSubmolt: (submoltId: string | null) => void
  setFeedLoading: (loading: boolean) => void
  updatePostVote: (postId: string, direction: VoteDirection, newKarma: number) => void
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
interface SubmoltsSlice {
  submolts: Submolt[]
  galaxyNodes: GalaxyNode[]
  galaxyEdges: GalaxyEdge[]
  selectedSubmolt: Submolt | null
  setSubmolts: (submolts: Submolt[]) => void
  setGalaxyData: (nodes: GalaxyNode[], edges: GalaxyEdge[]) => void
  setSelectedSubmoltDetail: (submolt: Submolt | null) => void
}

// --- Conversation Slice ---
interface ConversationSlice {
  activePostId: string | null
  comments: Comment[]
  selectedComment: Comment | null
  setActivePost: (postId: string | null) => void
  setComments: (comments: Comment[]) => void
  setSelectedComment: (comment: Comment | null) => void
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
interface AutopilotSlice {
  autopilotStatus: AutopilotStatus
  actionQueue: AgentAction[]
  decisionLog: ActivityLogEntry[]
  setAutopilotStatus: (status: AutopilotStatus) => void
  setActionQueue: (actions: AgentAction[]) => void
  setDecisionLog: (entries: ActivityLogEntry[]) => void
  removeFromQueue: (actionId: string) => void
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

// --- Bonus Slice ---
interface BonusSlice {
  moodData: MoodData | null
  trends: TrendItem[]
  rivalries: Rivalry[]
  karmaForecast: KarmaForecast | null
  postIdeas: PostIdea[]
  setMoodData: (mood: MoodData) => void
  setTrends: (trends: TrendItem[]) => void
  setRivalries: (rivalries: Rivalry[]) => void
  setKarmaForecast: (forecast: KarmaForecast) => void
  setPostIdeas: (ideas: PostIdea[]) => void
}

// --- Combined Store ---
export type AppState = UISlice & FeedSlice & AgentsSlice & SubmoltsSlice &
  ConversationSlice & PersonaSlice & SearchSlice & AnalyticsSlice &
  AutopilotSlice & ModerationSlice & SettingsSlice & BonusSlice

export const useStore = create<AppState>((set) => ({
  // --- UI ---
  activePanel: 'feed',
  sidebarCollapsed: false,
  theme: 'dark',
  commandPaletteOpen: false,
  notifications: [],
  setActivePanel: (panel) => set({ activePanel: panel }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTheme: (theme) => set({ theme }),
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
  selectedSubmolt: null,
  cursor: null,
  loading: false,
  setPosts: (posts) => set({ posts }),
  appendPosts: (posts, cursor) => set((s) => ({ posts: [...s.posts, ...posts], cursor })),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  setSelectedSubmolt: (submoltId) => set({ selectedSubmolt: submoltId }),
  setFeedLoading: (loading) => set({ loading }),
  updatePostVote: (postId, direction, newKarma) =>
    set((s) => ({
      posts: s.posts.map((p) => (p.id === postId ? { ...p, our_vote: direction, karma: newKarma } : p))
    })),

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
  setSubmolts: (submolts) => set({ submolts }),
  setGalaxyData: (galaxyNodes, galaxyEdges) => set({ galaxyNodes, galaxyEdges }),
  setSelectedSubmoltDetail: (submolt) => set({ selectedSubmolt: submolt as any }),

  // --- Conversation ---
  activePostId: null,
  comments: [],
  selectedComment: null,
  setActivePost: (activePostId) => set({ activePostId }),
  setComments: (comments) => set({ comments }),
  setSelectedComment: (selectedComment) => set({ selectedComment }),

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
  similarityThreshold: 0.5,
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
  setAutopilotStatus: (autopilotStatus) => set({ autopilotStatus }),
  setActionQueue: (actionQueue) => set({ actionQueue }),
  setDecisionLog: (decisionLog) => set({ decisionLog }),
  removeFromQueue: (actionId) =>
    set((s) => ({ actionQueue: s.actionQueue.filter((a) => a.id !== actionId) })),

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
  setPreferences: (preferences) => set({ preferences }),

  // --- Bonus ---
  moodData: null,
  trends: [],
  rivalries: [],
  karmaForecast: null,
  postIdeas: [],
  setMoodData: (moodData) => set({ moodData }),
  setTrends: (trends) => set({ trends }),
  setRivalries: (rivalries) => set({ rivalries }),
  setKarmaForecast: (karmaForecast) => set({ karmaForecast }),
  setPostIdeas: (postIdeas) => set({ postIdeas })
}))
