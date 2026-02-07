export const IPC = {
  // Feed
  FEED_LIST: 'feed:list',
  FEED_PERSONALIZED: 'feed:personalized',
  FEED_GET_POST: 'feed:get-post',
  FEED_CREATE_POST: 'feed:create-post',
  FEED_DELETE_POST: 'feed:delete-post',
  FEED_UPVOTE: 'feed:upvote',
  FEED_DOWNVOTE: 'feed:downvote',

  // Comments
  COMMENTS_GET_TREE: 'comments:get-tree',
  COMMENTS_CREATE: 'comments:create',
  COMMENTS_UPVOTE: 'comments:upvote',

  // Agents
  AGENTS_LIST: 'agents:list',
  AGENTS_GET_PROFILE: 'agents:get-profile',
  AGENTS_GET_MY_PROFILE: 'agents:get-my-profile',
  AGENTS_GET_NETWORK: 'agents:get-network',
  AGENTS_FOLLOW: 'agents:follow',
  AGENTS_UNFOLLOW: 'agents:unfollow',
  AGENTS_REGISTER: 'agents:register',
  AGENTS_UPDATE_PROFILE: 'agents:update-profile',

  // Submolts
  SUBMOLTS_LIST: 'submolts:list',
  SUBMOLTS_GET_DETAIL: 'submolts:get-detail',
  SUBMOLTS_GET_FEED: 'submolts:get-feed',
  SUBMOLTS_GET_GALAXY: 'submolts:get-galaxy',
  SUBMOLTS_CREATE: 'submolts:create',
  SUBMOLTS_SUBSCRIBE: 'submolts:subscribe',
  SUBMOLTS_UNSUBSCRIBE: 'submolts:unsubscribe',
  SUBMOLTS_UPDATE_SETTINGS: 'submolts:update-settings',

  // Moderation
  MOD_PIN: 'moderation:pin',
  MOD_UNPIN: 'moderation:unpin',
  MOD_ADD_MOD: 'moderation:add-mod',
  MOD_REMOVE_MOD: 'moderation:remove-mod',
  MOD_GET_MODS: 'moderation:get-mods',

  // LLM
  LLM_GENERATE: 'llm:generate',
  LLM_GENERATE_STREAM: 'llm:generate-stream',
  LLM_EMBED: 'llm:embed',
  LLM_STREAM_CHUNK: 'llm:stream-chunk',

  // Autopilot
  AUTOPILOT_SET_MODE: 'autopilot:set-mode',
  AUTOPILOT_GET_QUEUE: 'autopilot:get-queue',
  AUTOPILOT_APPROVE: 'autopilot:approve',
  AUTOPILOT_REJECT: 'autopilot:reject',
  AUTOPILOT_EMERGENCY_STOP: 'autopilot:emergency-stop',
  AUTOPILOT_GET_LOG: 'autopilot:get-log',
  AUTOPILOT_STATUS_UPDATE: 'autopilot:status-update',

  // Search
  SEARCH_EXECUTE: 'search:execute',
  SEARCH_GET_CLUSTERS: 'search:get-clusters',

  // Analytics
  ANALYTICS_KARMA_HISTORY: 'analytics:karma-history',
  ANALYTICS_ACTIVITY: 'analytics:activity',
  ANALYTICS_STATS: 'analytics:stats',

  // Persona
  PERSONA_SAVE: 'persona:save',
  PERSONA_LIST: 'persona:list',
  PERSONA_DELETE: 'persona:delete',
  PERSONA_GENERATE_PREVIEW: 'persona:generate-preview',

  // Settings
  SETTINGS_SAVE_API_KEY: 'settings:save-api-key',
  SETTINGS_TEST_CONNECTION: 'settings:test-connection',
  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_EXPORT: 'settings:export',
  SETTINGS_CLEAR_CACHE: 'settings:clear-cache',

  // Bonus
  BONUS_MOOD: 'bonus:mood',
  BONUS_TRENDS: 'bonus:trends',
  BONUS_RIVALRIES: 'bonus:rivalries',
  BONUS_FORECAST: 'bonus:forecast',
  BONUS_IDEAS: 'bonus:ideas',

  // Push events
  API_RATE_LIMIT_UPDATE: 'api:rate-limit-update'
} as const

export type IPCChannel = (typeof IPC)[keyof typeof IPC]
