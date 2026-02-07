import type {
  Post, Comment, AgentProfile, Submolt, SearchResult, VoteResult,
  AgentAction, AgentPersona, AutopilotStatus, ChatRequest, ChatResponse,
  KarmaSnapshot, PostPerformance, ActivityLogEntry, RateLimitState,
  GalaxyNode, GalaxyEdge, NetworkNode, NetworkEdge, SearchCluster,
  UserPreferences, ApiKeyStatus, MoodData, TrendItem, Rivalry,
  KarmaForecast, PostIdea, VoteDirection, OperationMode,
  LLMProviderName, SortOrder, ActionStatus, KeyValidationResult
} from './domain.types'

// =====================================================
// IPC Request / Response Payloads
// =====================================================

// --- Feed ---

export interface FeedListRequest {
  sort?: SortOrder
  submolt?: string
  limit?: number
}

export interface FeedListResponse {
  posts: Post[]
  next_cursor: string | null
}

export interface FeedPersonalizedRequest {
  sort?: SortOrder
  limit?: number
}

export interface FeedGetPostRequest {
  post_id: string
}

export interface FeedCreatePostRequest {
  submolt: string
  title: string
  content: string
  url?: string
}

export interface FeedDeletePostRequest {
  post_id: string
}

export interface FeedUpvoteRequest {
  post_id: string
}

export interface FeedDownvoteRequest {
  post_id: string
}

// --- Comments ---

export interface CommentsGetTreeRequest {
  post_id: string
  sort?: string
}

export interface CommentsGetTreeResponse {
  comments: Comment[]
}

export interface CommentsCreateRequest {
  post_id: string
  parent_id?: string
  content: string
}

export interface CommentsUpvoteRequest {
  comment_id: string
}

// --- Agents ---

export interface AgentsListRequest {
  cursor?: string
  limit?: number
  search?: string
}

export interface AgentsListResponse {
  agents: AgentProfile[]
  next_cursor: string | null
}

export interface AgentsGetProfileRequest {
  agent_name: string
}

export interface AgentsGetNetworkRequest {
  agent_name?: string
  depth?: number
}

export interface AgentsGetNetworkResponse {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
}

export interface AgentsFollowRequest {
  agent_name: string
}

export interface AgentsUnfollowRequest {
  agent_name: string
}

export interface AgentsRegisterRequest {
  name: string
  description: string
}

export interface AgentsRegisterResponse {
  api_key: string
  claim_url: string
  verification_code: string
}

export interface AgentsUpdateProfileRequest {
  description?: string
  metadata?: Record<string, unknown>
}

// --- Submolts ---

export interface SubmoltsListResponse {
  submolts: Submolt[]
}

export interface SubmoltsGetDetailRequest {
  submolt_name: string
}

export interface SubmoltsGetFeedRequest {
  submolt_name: string
  sort?: SortOrder
  limit?: number
}

export interface SubmoltsGetGalaxyResponse {
  nodes: GalaxyNode[]
  edges: GalaxyEdge[]
}

export interface SubmoltsCreateRequest {
  name: string
  display_name: string
  description: string
}

export interface SubmoltsSubscribeRequest {
  submolt_name: string
}

export interface SubmoltsUnsubscribeRequest {
  submolt_name: string
}

export interface SubmoltsUpdateSettingsRequest {
  submolt_name: string
  description?: string
  banner_color?: string
  theme_color?: string
}

// --- Moderation ---

export interface ModPinRequest {
  post_id: string
}

export interface ModUnpinRequest {
  post_id: string
}

export interface ModAddModRequest {
  submolt_name: string
  agent_name: string
  role?: string
}

export interface ModRemoveModRequest {
  submolt_name: string
  agent_name: string
}

export interface ModGetModsRequest {
  submolt_name: string
}

export interface ModGetModsResponse {
  moderators: any[]
}

// --- LLM ---

export type LLMGenerateRequest = ChatRequest

export type LLMGenerateResponse = ChatResponse

export interface LLMStreamRequest extends ChatRequest {
  request_id: string
}

// --- Autopilot ---

export interface AutopilotSetModeRequest {
  mode: OperationMode
}

export interface AutopilotGetQueueRequest {
  status?: ActionStatus
}

export interface AutopilotGetQueueResponse {
  actions: AgentAction[]
}

export interface AutopilotApproveRequest {
  action_id: string
  edited_content?: string
}

export interface AutopilotRejectRequest {
  action_id: string
  reason?: string
}

export interface AutopilotGetLogRequest {
  limit?: number
  offset?: number
}

export interface AutopilotGetLogResponse {
  entries: ActivityLogEntry[]
  total: number
}

// --- Search ---

export interface SearchExecuteRequest {
  query: string
  type?: 'posts' | 'comments' | 'all'
  limit?: number
}

export interface SearchExecuteResponse {
  results: SearchResult[]
}

export interface SearchGetClustersRequest {
  results: SearchResult[]
}

export interface SearchGetClustersResponse {
  clusters: SearchCluster[]
  points: Array<{ id: string; x: number; y: number }>
}

// --- Analytics ---

export interface AnalyticsKarmaHistoryRequest {
  days?: number
}

export interface AnalyticsKarmaHistoryResponse {
  snapshots: KarmaSnapshot[]
}

export interface AnalyticsActivityRequest {
  days?: number
  level?: string
}

export interface AnalyticsActivityResponse {
  entries: ActivityLogEntry[]
}

export interface AnalyticsStatsResponse {
  total_posts: number
  total_comments: number
  total_votes: number
  total_tokens: number
  total_cost: number
  avg_karma_per_post: number
  top_submolts: Array<{ name: string; count: number }>
  rate_limits: RateLimitState[]
}

// --- Persona ---

export interface PersonaSaveRequest {
  persona: Omit<AgentPersona, 'id' | 'created_at' | 'updated_at'> & { id?: string }
}

export interface PersonaDeleteRequest {
  persona_id: string
}

export interface PersonaGeneratePreviewRequest {
  persona: AgentPersona
  sample_post: Post
}

export interface PersonaGeneratePreviewResponse {
  preview_response: string
  tone_analysis: string
}

// --- Settings ---

export interface SettingsSaveApiKeyRequest {
  provider: string
  key: string
}

export interface SettingsTestConnectionRequest {
  provider: string
}

export interface SettingsTestConnectionResponse {
  result: KeyValidationResult
}

export interface SettingsGetAllResponse {
  preferences: UserPreferences
  api_keys: ApiKeyStatus[]
}

export interface SettingsExportResponse {
  data: string
  filename: string
}

// --- Bonus ---

export interface BonusMoodResponse {
  mood: MoodData
}

export interface BonusTrendsResponse {
  trends: TrendItem[]
}

export interface BonusRivalriesResponse {
  rivalries: Rivalry[]
}

export interface BonusForecastResponse {
  forecast: KarmaForecast
}

export interface BonusIdeasResponse {
  ideas: PostIdea[]
}
