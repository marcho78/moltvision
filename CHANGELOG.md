# Changelog

## 1.0.0 — 2025-02-06

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
