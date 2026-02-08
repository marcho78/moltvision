// =====================================================
// Core Domain Types — shared between main + renderer
// =====================================================

// --- Enums & Literals ---

export type LLMProviderName = 'claude' | 'openai' | 'gemini' | 'grok'

export type OperationMode = 'off' | 'semi-auto' | 'autopilot'

export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed'

export type ActionType =
  | 'create_post'
  | 'create_comment'
  | 'reply'
  | 'upvote'
  | 'downvote'
  | 'follow'
  | 'unfollow'
  | 'subscribe'
  | 'unsubscribe'
  | 'search'

export type VoteDirection = 'up' | 'down' | 'none'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type PanelId =
  | 'feed'
  | 'galaxy'
  | 'network'
  | 'conversation'
  | 'persona'
  | 'search'
  | 'analytics'
  | 'autopilot'
  | 'moderation'
  | 'settings'
  | 'help'
  | 'about'

export type SortOrder = 'hot' | 'new' | 'top' | 'rising'

export type FeedSource = 'all' | 'subscribed' | 'submolt' | 'saved'

// --- Moltbook API Data Types ---

export interface AgentProfile {
  id: string
  username: string
  display_name: string
  bio: string
  avatar_url: string | null
  karma: number
  post_karma: number
  comment_karma: number
  follower_count: number
  following_count: number
  is_following: boolean
  created_at: string
}

export interface Submolt {
  id: string
  name: string
  display_name: string
  description: string
  theme_color: string
  subscriber_count: number
  post_count: number
  is_subscribed: boolean
  moderators: string[]
  rules: string[]
  your_role: 'owner' | 'moderator' | null
  created_at: string
}

export interface Post {
  id: string
  title: string
  content: string
  author: AgentProfile
  submolt: { id: string; name: string; theme_color: string }
  karma: number
  comment_count: number
  our_vote: VoteDirection
  is_own: boolean
  created_at: string
  updated_at: string
}

export interface Comment {
  id: string
  post_id: string
  parent_id: string | null
  content: string
  author: AgentProfile
  karma: number
  our_vote: VoteDirection
  is_own: boolean
  depth: number
  children: Comment[]
  created_at: string
}

export interface SearchResult {
  id: string
  type: 'post' | 'comment' | 'agent' | 'submolt'
  title: string
  snippet: string
  score: number
  author?: string
  submolt?: string
  post_id?: string
  upvotes?: number
  downvotes?: number
  created_at?: string
}

export interface VoteResult {
  new_karma: number
  our_vote: VoteDirection
}

// --- Agent Persona ---

export interface ToneSettings {
  style: 'casual' | 'formal' | 'witty' | 'academic' | 'friendly'
  temperature: number
  max_length: number
}

export type ActivityProfile = 'lurker' | 'conversationalist' | 'creator' | 'community' | 'custom'

export interface PostStrategy {
  gap_detection: boolean
  momentum_based: boolean
  quality_gate: number // 0-10, LLM self-scores idea quality — only posts above this
  let_llm_decide: boolean
}

export interface CommentStrategy {
  early_voice: boolean      // Comment on low-comment posts to be first voice
  join_popular: boolean     // Comment on high-karma posts for visibility
  domain_expertise: boolean // Comment when topic matches interest tags
  ask_questions: boolean    // Ask questions instead of stating opinions
  freshness_hours: number   // Skip posts older than this (0 = no limit)
  let_llm_decide: boolean
}

export interface EngagementRules {
  engagement_rate: number
  min_karma_threshold: number
  reply_to_replies: boolean
  avoid_controversial: boolean
  max_posts_per_hour: number
  max_comments_per_hour: number
  max_reply_depth: number
  max_replies_per_thread: number
  activity_profile: ActivityProfile
  post_strategy: PostStrategy
  comment_strategy: CommentStrategy
  daily_post_budget: number
  daily_comment_budget: number
}

export interface AgentPersona {
  id: string
  name: string
  description: string
  tone_settings: ToneSettings
  interest_tags: string[]
  engagement_rules: EngagementRules
  submolt_priorities: Record<string, number>
  system_prompt: string
  llm_provider: LLMProviderName
  created_at: string
  updated_at: string
}

// --- Action Queue ---

export interface ActionPayload {
  type: ActionType
  submolt_name?: string
  post_id?: string
  comment_id?: string
  agent_name?: string
  title?: string
  content?: string
  url?: string
  query?: string
}

export interface AgentAction {
  id: string
  payload: ActionPayload
  status: ActionStatus
  priority: number
  reasoning: string
  context: string
  llm_provider: LLMProviderName | null
  tokens_used: number
  cost: number
  created_at: string
  completed_at: string | null
  error: string | null
}

// --- Autopilot ---

export interface AutopilotSchedule {
  scan_interval_ms: number
  active_windows: Array<{ start: string; end: string }>
  max_actions_per_hour: number
  max_actions_per_day: number
  cooldown_ms: number
}

export interface AutopilotStatus {
  mode: OperationMode
  is_running: boolean
  last_scan_at: string | null
  actions_this_hour: number
  actions_today: number
  comments_this_hour: number
  comments_today: number   // tracked against 50/day API limit
  posts_today: number      // tracked against 1-per-30-min API limit
  next_scan_at: string | null
  emergency_stopped: boolean
}

// --- LLM ---

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type TokenUsagePurpose =
  | 'evaluation'          // Autopilot evaluating whether to engage a post
  | 'content_generation'  // Generating comment or post body
  | 'reply_evaluation'    // Deciding whether to reply to someone
  | 'reply_generation'    // Writing reply content
  | 'post_decision'       // Deciding whether to create an original post
  | 'persona_preview'     // Voice preview in Persona Studio
  | 'persona_test'        // Decision tests in Persona Studio
  | 'manual_generation'   // User-initiated from Conversation panel
  | 'whoami'              // Model identity check
  | 'embedding'           // Semantic search embedding
  | 'bonus'               // Reserved for future analytics

export interface ChatRequest {
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  json_mode?: boolean
  provider?: LLMProviderName
  purpose?: TokenUsagePurpose
}

export interface ChatResponse {
  content: string
  provider: LLMProviderName
  model: string
  tokens_input: number
  tokens_output: number
  cost: number
  latency_ms: number
}

export interface StreamChunk {
  content: string
  done: boolean
  provider?: LLMProviderName
}

export interface TokenCountResult {
  count: number
  provider: LLMProviderName
}

export interface KeyValidationResult {
  valid: boolean
  provider: LLMProviderName
  error?: string
}

export interface ProviderHealth {
  provider: LLMProviderName
  available: boolean
  latency_ms: number
  error?: string
}

// --- Analytics ---

export interface KarmaSnapshot {
  id: string
  karma: number
  post_karma: number
  comment_karma: number
  follower_count: number
  post_count: number
  recorded_at: string
}

export interface PostPerformance {
  id: string
  post_id: string
  karma: number
  comment_count: number
  recorded_at: string
}

export interface ActivityLogEntry {
  id: string
  activity_type: string
  summary: string
  details: Record<string, unknown>
  llm_provider: LLMProviderName | null
  tokens_used: number
  cost: number
  level: LogLevel
  created_at: string
}

// --- Rate Limits ---

export interface RateLimitState {
  resource: string
  max_requests: number
  remaining: number
  reset_at: string
}

// --- Graph Data ---

export interface GalaxyNode {
  id: string
  name: string
  display_name: string
  theme_color: string
  subscriber_count: number
  post_count: number
  is_subscribed: boolean
  x?: number
  y?: number
  z?: number
}

export interface GalaxyEdge {
  source: string
  target: string
  weight: number
}

export interface NetworkNode {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  karma: number
  is_following: boolean
  x?: number
  y?: number
  z?: number
}

export interface NetworkEdge {
  source: string
  target: string
  direction: 'following' | 'follower' | 'mutual'
}

// --- Search Clusters ---

export interface SearchCluster {
  id: string
  label: string
  center: [number, number]
  items: string[]
  color: string
}

// --- Theme ---

export interface ThemeColors {
  bg: string
  surface: string
  border: string
  text: string
  muted: string
  accent: string
  'accent-hover': string
  success: string
  warning: string
  error: string
  info: string
}

export type ThemePresetId = 'dark' | 'midnight' | 'forest' | 'warm' | 'light'

// --- Settings ---

export interface UserPreferences {
  active_llm: LLMProviderName
  fallback_llm: LLMProviderName | null
  panel_layout: Record<string, unknown>
  theme: ThemePresetId | 'custom'
  operation_mode: OperationMode
  heartbeat_interval: number
  llm_temperature: number
  max_tokens: number
  active_persona_id: string
  suppress_sync_prompt: boolean
  theme_custom_colors: ThemeColors | null
}

export interface ApiKeyStatus {
  provider: string
  configured: boolean
  valid: boolean | null
  last_tested: string | null
}

// --- Agent Engagement Tracking ---

export interface AgentEngagement {
  id: string
  post_id: string
  comment_id: string | null
  action_type: ActionType
  content_sent: string | null
  persona_id: string
  reasoning: string | null
  created_at: string
}

export interface ContentPerformance {
  id: string
  post_id: string | null
  comment_id: string | null
  content_type: 'post' | 'comment'
  karma_at_creation: number
  karma_current: number
  comment_count: number
  last_checked_at: string
  created_at: string
}

export interface ReplyInboxEntry {
  id: string
  parent_post_id: string
  parent_comment_id: string | null
  agent_original_content: string | null
  reply_comment_id: string
  reply_author: string
  reply_content: string
  depth: number
  is_read: boolean
  agent_responded: boolean
  discovered_at: string
}

// --- Token Usage Tracking ---

export interface TokenUsageRecord {
  id: string
  purpose: TokenUsagePurpose
  provider: LLMProviderName
  model: string
  tokens_input: number
  tokens_output: number
  persona_id: string | null
  created_at: string
}

export interface TokenUsageStats {
  today: { input: number; output: number }
  week: { input: number; output: number }
  month: { input: number; output: number }
  all_time: { input: number; output: number }
  by_purpose: Array<{ purpose: string; input: number; output: number }>
  by_provider: Array<{ provider: string; input: number; output: number }>
  daily_trend: Array<{ date: string; input: number; output: number }>
}
