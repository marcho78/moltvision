# Changelog

## 0.3.1 — 2026-02-07

Stability patch — fixes React crash on autopilot scanning, hardens API data normalization, improves autopilot UI and rate limit enforcement.

### Bug Fixes
- Fixed React crash "Objects are not valid as a React child (found: object with keys {id, name, display_name})" during autopilot scanning — raw Moltbook API objects (submolt, author) were reaching JSX rendering
- Fixed `FEED_GET_POST` IPC handler returning raw API data without normalizing nested submolt/author objects
- Fixed `COMMENTS_GET_TREE` IPC handler — comment author fields now recursively normalized through the entire tree
- Fixed `SUBMOLTS_GET_FEED` IPC handler returning unnormalized post data
- Fixed LLM JSON parsing failures when responses are wrapped in markdown fences — added `cleanJsonResponse()` extractor with proper bracket matching
- Fixed Grok provider not sending `response_format: { type: 'json_object' }` when `json_mode` is true

### Defensive Rendering
- Added `sanitizeEvent()` and `safePrimitive()` to `useAutopilotEvents` hook — all live event fields are coerced to primitive strings before entering the Zustand store, preventing objects from reaching React children
- Added `safeStr()` utility across AutopilotPanel — wraps every external data interpolation in LiveAgentFeed, ActionQueueItem, ActivityTab, RepliesTab, TargetSubmolts, and PersonaSelector
- TargetSubmolts now normalizes submolt data on load (matching Sidebar's normalization pattern) instead of setting raw API responses

### Autopilot Service Improvements
- Action cooldown changed from 5s to 21s (API enforces 1 comment per 20 seconds)
- Rate limits clamped to API maximums: max_posts_per_hour capped at 2 (API: 1 per 30 min), max_comments_per_hour capped at 10
- Daily comment limit enforced (50/day API limit) — scan cycle exits early when daily cap is reached
- Detailed `scan:progress` events emitted at 6 phases: evaluating, evaluated, planning, queued, executed, with post context
- Semi-auto mode now stores `original_post` context in action queue payload for richer queue item display
- `queue:updated` event emitted after enqueueing actions in semi-auto mode

### AutopilotPanel UI Enhancements
- LiveAgentFeed redesigned as console-style "Agent Thinking" log with phase-based color coding
- ActionQueueItem now shows original post context (title, submolt, karma) alongside the draft action
- Editable draft content in queue items before approving
- Action type badges (comment, upvote, downvote, post) with distinct styling
- QueueTab: added "Reject All" and "Clear History" bulk actions
- QueueTab: auto-refreshes and switches to Queue tab on `queue_updated` events
- QueueTab: separates pending actions from recent completed/rejected history
- ControlsTab: shows comments/hour, comments/day progress bars, and posts/today counter
- Removed duplicate `useAutopilotEvents()` call (now only in App.tsx)

### PersonaStudioPanel
- Added API rate limits info box showing post, comment, and general rate limits
- Slider ranges clamped to API maximums (max_posts_per_hour: 2, max_comments_per_hour: 10)

### SearchExplorerPanel
- Defensive type checks on `result.submolt` and `result.author` rendering — handles both string and object shapes

### New IPC Channels
- `autopilot:reject-all` — bulk reject all pending queue items
- `autopilot:clear-queue` — clear completed/rejected actions from history

### Domain Types
- `AutopilotStatus` extended with `comments_this_hour`, `comments_today`, `posts_today` fields

### New Query
- `clearCompletedActions()` in queue.queries.ts — deletes completed/failed/rejected actions from action_queue

## 0.3.0 — 2026-02-07

Autonomous agent conversation system — persona-driven decision-making, engagement tracking, content origination, reply monitoring, and real-time observability.

### Autopilot Service (Rewritten)
- Persona-driven decision loop: `loadPersona()` reads active persona from DB at start of every scan cycle — system prompt, tone, interests, engagement rules, and submolt priorities now control all LLM evaluations
- Multi-source content discovery: personalized feed + top 3 priority submolt feeds + top 3 interest tag searches, deduplicated by post ID
- Engagement dedup: `hasEngaged()` check prevents re-engaging the same post across cycles
- Engagement rate probability gate and min_karma_threshold filter applied before evaluation
- `evaluatePost()` rewritten: persona system prompt, interest tags, controversial-topic avoidance, outputs verdict/reasoning/action/priority as structured JSON
- `planAction()` rewritten: persona voice for content generation, 125-char hard limit enforcement for comments, vote actions skip LLM call
- Content origination: `considerCreatingPost()` — LLM decides whether to create an original post, picks submolt from priorities, generates title+content. Respects 30-min API rate limit and persona `max_posts_per_hour`
- Reply monitoring: `checkForReplies()` polls comment trees of recent agent posts (last 24h, max 5), discovers new replies, inserts into `reply_inbox` with dedup. `evaluateReply()` decides whether to respond based on thread depth and reply count limits
- Reply generation: `generateReply()` produces persona-voiced replies (125-char limit), auto-executes in autopilot, queues in semi-auto
- Per-persona LLM provider: all 4 LLM calls (evaluate, evaluateReply, plan, considerCreating) pass `provider: persona.llm_provider`
- Semi-auto fix: both semi-auto and autopilot modes now call `start()` so scanning runs in both modes (previously semi-auto called `stopTimer()` and never scanned)
- First scan runs immediately on mode activation (no longer waits for interval)
- `scan:progress` events emitted at 6 points in cycle (start, feed, submolt, evaluate, done, error) for real-time UI updates
- `action:executed` event includes full payload details (action type, submolt, post ID, content preview, title)
- Active persona persisted to `user_preferences.active_persona_id` — survives app restart
- `loadPersistedPersona()` called on app startup after DB init

### Engagement Tracking Database (3 New Tables)
- `agent_engagements` — records every action the agent takes (post_id, comment_id, action_type, content_sent, persona_id, reasoning). Indexed on post, type, and time. Used for dedup and activity history
- `agent_content_performance` — tracks karma/replies on agent's own content over time (karma_at_creation, karma_current, comment_count, last_checked_at)
- `reply_inbox` — replies to the agent's posts/comments discovered via polling (parent context, reply author/content, depth, read status, agent_responded flag). UNIQUE on reply_comment_id prevents dupes
- Migration v3: version bump for engagement tables (created via `CREATE IF NOT EXISTS` in schema)

### Per-Persona LLM Provider Selection
- `llm_provider` column added to `agent_persona` table (default: 'claude')
- Migration v4: `ALTER TABLE agent_persona ADD COLUMN llm_provider`
- Persona save/load includes `llm_provider` field
- `PERSONA_GENERATE_PREVIEW` accepts `provider` override, returns `provider_used`

### Active Persona Persistence
- `active_persona_id` column added to `user_preferences` (default: 'default')
- Migration v5: `ALTER TABLE user_preferences ADD COLUMN active_persona_id`
- `setActivePersona()` persists to DB, `loadPersistedPersona()` restores on startup
- Settings save/load includes `active_persona_id`

### Who Am I — LLM Identity Verification
- New IPC channel `llm:whoami` — asks the selected LLM to state its model name and provider in one sentence
- Returns identity string, provider, model, and latency
- UI button in Persona Studio shows which model is actually responding for the selected provider

### AutopilotPanel (Redesigned — 4 Tabs)
- Tab bar: Controls, Activity, Queue, Replies with unread/pending badges
- **Controls tab**: mode toggle, persona selector dropdown, target submolts editor (quick-add from subscriptions, manual add, priority sliders, remove), live agent status feed (pulsing scan indicator, recent action events with color-coded badges), stats cards (actions/hour, actions/today, status), rate limit dashboard bars, emergency stop
- **Activity tab**: paginated engagement history from `agent_engagements`, filter by action type (posts/comments/votes), click-through to conversation panel, action type badges, timestamps, content previews and reasoning
- **Queue tab**: action queue with approve/reject for semi-auto mode, pending count display
- **Replies tab**: reply inbox from `reply_inbox` table, unread indicator dots, "Mark all as read", per-reply "View Thread" and "Mark Read" buttons, shows agent's original content as context

### PersonaStudioPanel (Enhanced)
- LLM provider selector dropdown per persona (Claude, OpenAI, Gemini, Grok)
- "Who Am I?" button with loading state — verifies which model responds for the selected provider
- Submolt priority editor: quick-add from subscriptions, manual entry, priority 1-10 sliders, remove buttons

### ConversationPanel (Enhanced)
- Agent Reply button on comments: generates persona-voiced reply via LLM, editable draft, 125-char enforcement, submit with `/comments` API
- Agent top-level Comment button on posts: same agent reply flow but creates a top-level comment (no parent_id)
- Fixed: AgentReplyBox now passes `provider: persona.llm_provider` to LLM generate call

### GalaxyMapPanel (Enhanced)
- "Deploy Agent Here" button in submolt detail sidebar: adds the selected submolt to the active persona's `submolt_priorities` with priority 5
- "Agent Targeting" indicator with click-to-remove when submolt is already in priorities
- Loads and saves persona via `PERSONA_SAVE` IPC

### LiveFeedPanel (Enhanced)
- Agent post indicators: posts created by the agent show subtle visual differentiation

### AnalyticsPanel (Enhanced)
- Agent Performance section: total posts, comments, upvotes, downvotes from `agent_engagements` data, total engagement count

### Real-Time Observability
- New push channel `autopilot:live-event` — forwards scan progress and action events from main process to renderer
- `useAutopilotEvents` hook: listens to both `autopilot:status-update` and `autopilot:live-event`
- `LiveEvent` type in Zustand store: type, timestamp, phase, message, action_type, submolt, post_id, content, title
- Store keeps last 50 events via `addLiveEvent()` with FIFO trimming

### New IPC Channels
- `llm:whoami` — LLM identity verification
- `autopilot:live-event` — push channel for scan progress and action events
- `autopilot:set-persona` — set active persona for autopilot
- `autopilot:get-persona` — get currently active persona ID
- `autopilot:get-activity` — paginated engagement history
- `autopilot:get-replies` — reply inbox with unread count
- `autopilot:mark-replies-read` — batch mark replies as read

### Preload (Updated)
- Added `llm:whoami` to allowed invoke channels
- Added `autopilot:set-persona`, `autopilot:get-persona`, `autopilot:get-activity`, `autopilot:get-replies`, `autopilot:mark-replies-read` to allowed invoke channels
- Added `autopilot:live-event` to allowed push event channels

### Zustand Store (Extended)
- AutopilotSlice: added `activePersonaId`, `agentActivity`, `replyInbox`, `unreadReplyCount`, `liveEvents` state fields
- Added `setActivePersonaId`, `setAgentActivity`, `setReplyInbox`, `setUnreadReplyCount`, `addLiveEvent` actions
- `LiveEvent` interface for real-time scan/action events

### Domain Types (Extended)
- `AgentEngagement` interface (id, post_id, comment_id, action_type, content_sent, persona_id, reasoning, created_at)
- `ReplyInboxEntry` interface (id, parent_post_id, parent_comment_id, agent_original_content, reply_comment_id, reply_author, reply_content, depth, is_read, agent_responded, discovered_at)
- `UserPreferences`: added `active_persona_id` field
- `EngagementRules`: added `max_reply_depth` (default 3), `max_replies_per_thread` (default 2)

### New File
- `src/main/db/queries/engagement.queries.ts` — all engagement tracking, performance, and reply inbox query helpers (recordEngagement, hasEngaged, countEngagementsInPeriod, getEngagementHistory, countRepliesInThread, addToReplyInbox, getUnrespondedReplies, markReplyResponded, getRecentAgentPostIds, getAllReplies, getUnreadReplyCount, markRepliesRead)

## 0.2.0 — 2026-02-07

Major overhaul of all panels, API response handling, submolt caching, feed system, and UI resilience.

### Submolt Cache System (New)
- Background sync of all 16,000+ submolts into SQLite (100 per request, 1.5s delay, rate-limit-aware with 60s pause on 429)
- Incremental updates: compares cached count vs API total, only fetches delta pages
- First-run sync modal prompts user on initial launch if no submolts are cached — explains one-time sync, user can continue using the app while it runs in the background
- Manual sync controls in Settings > Data tab: "Sync Submolts" / "Update Submolts" / "Full Re-sync" with live progress bar
- `user_subscriptions` table (persistent — survives cache clears) tracks subscriptions independently from the submolt cache
- New IPC channels: `submolts:cache-sync`, `submolts:search-cached`, `submolts:cache-status` (push event)
- SQLite search: `searchCachedSubmolts()` with LIKE match on name, display_name, description, ordered by subscriber count
- Paginated submolt fetch: `submolts:get-page` IPC channel for galaxy map browsing (single API call per page)

### Live Feed Panel (Redesigned)
- Three feed sources: All (global `/posts`), Subscribed (personalized `/feed`), per-Submolt (`/submolts/{name}/feed`)
- Feed source tabs in toolbar
- Dual view modes: compact (Reddit-style rows) and card (social media cards with avatars, read-more expansion, action bars)
- Submolt browser sidebar: toggleable 256px panel searches all cached submolts via IPC (150ms debounce), shows color dot, display name, subscriber count; selecting a submolt switches the feed
- Offset-based pagination with "Load More" button and deduplication
- Agent avatars with deterministic hue-from-name coloring
- Dedicated SVG icons for upvote, downvote, comments, list view, card view
- `formatKarma()` null guard to handle undefined karma from API

### Conversation Panel (Rewritten)
- Replaced D3.js tree visualization with Reddit-style threaded comment viewer
- Full post detail header with author avatar, submolt badge, vote controls, content, and "Back to Feed" navigation
- Nested comment tree with collapsible thread lines, depth indicators, and descendant count on collapse
- Inline reply boxes at any nesting depth (top-level and per-comment)
- Comment karma coloring (positive = accent, negative = red)
- Comment upvote support
- "YOUR POST" / "YOU" badges for own content

### Galaxy Map Panel (Rewritten)
- Replaced Three.js 3D scene with D3.js 2D force-directed graph
- Node sizing: power-curve on subscriber count ratio (8px floor to 80px ceiling)
- Five-tier popularity coloring: dim steel (<20), bright blue (20+), vivid purple (100+), bright orange (500+), hot red (2000+)
- Per-node radial gradients and glow filters scaled by log-normalized popularity
- D3 zoom/pan behavior with initial centering
- Paginated loading: 500 submolts per API page with prev/next controls
- Detail sidebar: submolt description, subscriber/post counts, subscribe/unsubscribe, moderator list, creation date
- Search bar filters nodes in real time
- Graceful fallback: tries `/submolts/galaxy` endpoint first, falls back to paginated `/submolts`

### Agent Network Panel (Rewritten)
- Replaced Three.js 3D scene with card-based agent directory
- Responsive grid layout (1-3 columns) with search and sort (karma/posts/name)
- Agent cards: gradient avatar, display name, username, karma, post count, active submolt tags, following badge
- Detail sidebar: full profile with stats grid, active submolts list, join date, follow/unfollow button with gradient styling
- Agents built from cached post data when `/agents` endpoint is unavailable (extracts unique authors, derives shared-submolt edges from co-posting activity)
- New DB queries: `getAgentsFromPosts()`, `getAgentSubmoltEdges()`

### Search Explorer Panel (Rewritten)
- Full search interface: type filter (all/posts/comments), sort (relevance/newest/upvotes), author filter, submolt filter
- Submolt picker: IPC-backed SQLite search across all cached submolts (200ms debounce), shows subscriber counts, free-text fallback, "No submolts synced" guidance pointing to Settings > Data
- Dual-pane layout: SVG scatter plot (distance from center = relevance, angular sector = type) + scrollable result list
- Result cards: relevance bar, title, snippet, author, submolt badge, vote counts, timestamp
- Cursor-based pagination with "Load More"
- Relevance normalization: scores normalized 0-1 relative to batch maximum
- Search cluster layout: type-based angular sectors with jitter, replaces random pseudo-layout

### Settings Panel (Enhanced)
- New "Submolt Database" section in Data tab: cached count display, sync/update/full re-sync buttons, live progress bar during sync, push event listener for real-time status

### Sidebar (Enhanced)
- Subscriptions tree: collapsible section showing subscribed submolts with color dots, display names, click-to-browse (switches feed to that submolt), and inline unsubscribe button on hover
- Collapsed mode: color dot indicators for subscribed submolts
- Fetches submolts on mount via IPC, normalizes API response shapes

### App Shell (Enhanced)
- Auto-tests Moltbook connection on startup, then checks submolt cache — triggers first-run sync modal if connected but no submolts cached
- `SubmoltSyncModal`: explains one-time sync, "Sync Now" / "Later" buttons, progress bar, auto-closes on completion
- `PanelErrorBoundary`: catches React render crashes per panel, shows error details + stack trace + "Try Again" button, auto-resets on panel switch

### API Response Handling (Fixed)
- All feed/agent/submolt IPC handlers now normalize API responses: handles both `{posts: [...]}` and raw array formats
- Post mapping: correctly extracts nested `author.name`, `author.id`, `submolt.display_name`, `submolt.name`, `submolt.theme_color`; computes karma from `upvotes - downvotes` when `karma` field is missing
- Agent upsert: null-safe with fallbacks for all fields (`agent.id ?? agent.name`, `agent.username ?? agent.name`, etc.)
- Submolt upsert: no longer overwrites `is_subscribed` from API — subscription state managed by `user_subscriptions` table
- Subscribe/unsubscribe: saves to local DB first, then calls API (local-first pattern — works even if API call fails)
- Search results: strips `<mark>` tags from titles/snippets, maps `relevance`/`similarity` fields to normalized score

### Feed Hook (Rewritten)
- `useLiveFeed`: supports three feed sources (all/subscribed/submolt) with source-appropriate API endpoints
- Offset-based pagination (replaces cursor-based)
- Post deduplication on append (prevents duplicates from polling overlap)
- Concurrent fetch guard (prevents StrictMode double-mount races)

### Zustand Store (Extended)
- New feed state: `feedSource` ('all'|'subscribed'|'submolt'), `feedView` ('compact'|'card'), `nextOffset`, `hasMore`
- `setSelectedSubmolt()` now auto-switches `feedSource` to 'submolt' and clears posts
- `setSortOrder()` and `setFeedSource()` clear posts and reset pagination
- `appendPosts()` deduplicates by post ID
- New conversation state: `activePost` (full Post object), `conversationView` ('thread'|'tree')
- `selectedSubmoltDetail` fixed: was incorrectly aliased to `selectedSubmolt` (feed filter), now separate
- Sort order type: 'controversial' replaced with 'rising'
- `FeedSource` type added to shared domain types
- `SearchResult` type: added `author`, `submolt`, `post_id`, `upvotes`, `downvotes`, `created_at` fields
- `similarityThreshold` default changed from 0.5 to 0

### Database (Enhanced)
- `user_subscriptions` table: persistent submolt subscription tracking (not cleared by cache cleanup)
- Schema migration v2: clears stale posts cache that stored UUIDs as author names
- Startup cache cleanup: clears all cached submolts (re-fetched each session), expires posts >3 days, comments/agents >7 days
- `expireOldPosts()` and `expireOldCaches()` query helpers
- Rate limits reset on app startup (stale from previous session)
- UTC datetime parsing fix: SQLite `datetime('now')` returns UTC without 'Z' suffix — `parseUtc()` helper appends 'Z' before JS Date parsing

### Moltbook API Client (Enhanced)
- `getFeed()` and `getPersonalizedFeed()`: added `offset` parameter for pagination, response type updated to `next_offset`/`has_more`
- `getSubmolts()`: added `limit`/`offset` parameters, response includes `count`/`has_more`/`next_offset`
- `search()`: accepts options object with `type`, `limit`, `cursor`, `author`, `submolt` filters; response includes `next_cursor`, `has_more`, `count`
- Request/response logging added for debugging

### Preload (Updated)
- Added `submolts:get-page`, `submolts:cache-sync`, `submolts:search-cached` to allowed invoke channels
- Added `submolts:cache-status` to allowed push event channels

### IPC Payloads (Updated)
- `FeedListRequest`/`FeedPersonalizedRequest`: added `offset` field
- `FeedListResponse`: `next_cursor` replaced with `next_offset`/`has_more`
- New types: `SubmoltsPageRequest`, `SubmoltsPageResponse` for paginated submolt fetching

### Search Clusters (Improved)
- Layout: similarity score determines distance from center (high = close, low = far); type determines angular sector
- Type-based angular sectors with configurable spread and jitter to avoid overlaps
- Cluster centers calculated from constituent points
- Deterministic color mapping per type (post = purple, comment = green, agent = blue, submolt = yellow)

## 0.1.0 — 2025-02-06

Initial release.

### Core Infrastructure
- Electron + React + TypeScript project with electron-vite build tooling
- SQLite database with 14 tables (configuration, cache, analytics, operational)
- FTS5 virtual table for full-text search with automatic sync triggers
- Secure IPC architecture: ~45 namespaced channels with preload whitelist
- API key encryption via Electron safeStorage (OS keychain-backed AES-256-GCM)
- Context isolation, sandbox mode, CSP headers

### Moltbook API Integration
- Full REST client for the Moltbook API (https://www.moltbook.com/api/v1)
- Agent registration with claim URL and tweet verification flow
- Profile management, personalized feed, submolt feeds
- Post CRUD with separate upvote/downvote endpoints
- Comment creation and upvoting
- Agent follow/unfollow, submolt subscribe/unsubscribe
- Moderation tools: pin/unpin posts, add/remove moderators
- Rate limit tracking from response headers with priority request queue
- Exponential backoff on server errors
- Uses Electron net.fetch (Chromium network stack)

### Multi-LLM Support
- Four providers: Claude (Anthropic SDK), OpenAI, Gemini (Google GenAI), Grok (OpenAI-compatible)
- Common LLMProvider interface with chat, streaming, token counting, key validation
- LLMManager with active + fallback provider, automatic failover
- Typed error hierarchy (auth, rate limit, unavailable, content filter, token limit)

### Agent Engine
- Decision loop: feed scanning, post evaluation, action planning
- Semi-auto mode with action queue (propose -> approve/reject -> execute)
- Autopilot mode with configurable schedule, hourly/daily action caps
- Emergency stop (AbortController-based global kill switch)
- 10 action types: create_post, create_comment, reply, upvote, downvote, follow, unfollow, subscribe, unsubscribe, search

### Panels
- **Live Feed Stream**: auto-refresh polling, post composer, submolt filter, vote buttons
- **Conversation Tree Viewer**: D3.js hierarchical tree layout, sentiment color coding, karma-sized nodes
- **Submolt Galaxy Map**: Three.js 3D force-directed graph, theme-colored nodes, subscription glow
- **Agent Network Graph**: Three.js 3D graph, karma-sized nodes, follow edges, right-click follow/unfollow
- **Agent Persona Studio**: tone sliders, interest tags, engagement rules, system prompt, live LLM preview
- **Semantic Search Explorer**: FTS5-backed search, D3.js scatter plot with cluster hulls, similarity slider
- **Activity & Analytics**: karma line chart, 90-day activity heatmap, rate limit bars, stat cards, date range picker
- **Autopilot Controls**: mode toggle, action queue with approve/reject, action counters, emergency stop
- **Moderation Dashboard**: submolt selector, pin manager, moderator list, moderation log

### Bonus Features
- Mood Ring: D3.js radial chart of per-submolt engagement sentiment
- Trend Detector: cross-submolt trending topics with sparkline graphs
- Rivalry Tracker: agent disagreement scoring with intensity bars
- Karma Forecast: D3.js line chart with historical + projected trajectory, LLM analysis
- Post Idea Generator: LLM-powered content suggestions with adopt button

### UI Shell
- Custom frameless window with title bar drag region
- Sidebar icon rail with 11 navigation items
- Dark theme with Tailwind CSS custom color palette
- Ctrl+K command palette
- Status bar (connection, autopilot mode, rate limits, active LLM)
- Toast notification system
- Lazy-loaded panel components

### State Management
- Zustand store with 12 slices: ui, feed, agents, submolts, conversation, persona, search, analytics, autopilot, moderation, settings, bonus

### Settings
- Agent registration flow with auto-save
- Per-provider API key management with masked input and connection test
- Active LLM provider selector
- Data export and cache clearing
