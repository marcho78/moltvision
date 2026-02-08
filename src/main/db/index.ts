import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import log from 'electron-log'

const SCHEMA_SQL = `
-- Schema Version Tracking
CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 1,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 1);

-- Configuration Tables
CREATE TABLE IF NOT EXISTS api_keys (
  provider TEXT PRIMARY KEY,
  encrypted_key BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_persona (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT 'MoltVision Agent',
  description TEXT NOT NULL DEFAULT '',
  tone_settings TEXT NOT NULL DEFAULT '{"style":"friendly","temperature":0.7,"max_length":500}',
  interest_tags TEXT NOT NULL DEFAULT '[]',
  engagement_rules TEXT NOT NULL DEFAULT '{"engagement_rate":0.3,"min_karma_threshold":0,"reply_to_replies":true,"avoid_controversial":false,"max_posts_per_hour":2,"max_comments_per_hour":10,"max_reply_depth":3,"max_replies_per_thread":2}',
  submolt_priorities TEXT NOT NULL DEFAULT '{}',
  system_prompt TEXT NOT NULL DEFAULT 'You are a helpful and engaging AI agent participating in Moltbook discussions.',
  llm_provider TEXT NOT NULL DEFAULT 'claude',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO agent_persona (id) VALUES ('default');

CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_llm TEXT NOT NULL DEFAULT 'claude',
  fallback_llm TEXT,
  panel_layout TEXT NOT NULL DEFAULT '{}',
  theme TEXT NOT NULL DEFAULT 'dark',
  operation_mode TEXT NOT NULL DEFAULT 'off',
  heartbeat_interval INTEGER NOT NULL DEFAULT 15000,
  llm_temperature REAL NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 1024,
  active_persona_id TEXT NOT NULL DEFAULT 'default'
);
INSERT OR IGNORE INTO user_preferences (id) VALUES (1);

-- Cache Tables
CREATE TABLE IF NOT EXISTS cached_agents (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  karma INTEGER NOT NULL DEFAULT 0,
  post_karma INTEGER NOT NULL DEFAULT 0,
  comment_karma INTEGER NOT NULL DEFAULT 0,
  follower_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  is_following INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agents_username ON cached_agents(username);
CREATE INDEX IF NOT EXISTS idx_agents_karma ON cached_agents(karma DESC);

CREATE TABLE IF NOT EXISTS cached_submolts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  theme_color TEXT NOT NULL DEFAULT '#7c5cfc',
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  is_subscribed INTEGER NOT NULL DEFAULT 0,
  moderators TEXT NOT NULL DEFAULT '[]',
  rules TEXT NOT NULL DEFAULT '[]',
  your_role TEXT,
  created_at TEXT NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_submolts_name ON cached_submolts(name);

CREATE TABLE IF NOT EXISTS cached_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_username TEXT NOT NULL,
  submolt_id TEXT NOT NULL,
  submolt_name TEXT NOT NULL,
  submolt_theme_color TEXT NOT NULL DEFAULT '#7c5cfc',
  karma INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  our_vote TEXT NOT NULL DEFAULT 'none',
  is_own INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_submolt ON cached_posts(submolt_id);
CREATE INDEX IF NOT EXISTS idx_posts_author ON cached_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_karma ON cached_posts(karma DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON cached_posts(created_at DESC);

CREATE TABLE IF NOT EXISTS cached_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  parent_id TEXT,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_username TEXT NOT NULL,
  karma INTEGER NOT NULL DEFAULT 0,
  our_vote TEXT NOT NULL DEFAULT 'none',
  is_own INTEGER NOT NULL DEFAULT 0,
  depth INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON cached_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON cached_comments(parent_id);

-- FTS5 virtual table for full-text search on posts
CREATE VIRTUAL TABLE IF NOT EXISTS fts_posts USING fts5(
  title, content, author_username, submolt_name,
  content=cached_posts, content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS fts_posts_ai AFTER INSERT ON cached_posts BEGIN
  INSERT INTO fts_posts(rowid, title, content, author_username, submolt_name)
  VALUES (new.rowid, new.title, new.content, new.author_username, new.submolt_name);
END;

CREATE TRIGGER IF NOT EXISTS fts_posts_ad AFTER DELETE ON cached_posts BEGIN
  INSERT INTO fts_posts(fts_posts, rowid, title, content, author_username, submolt_name)
  VALUES ('delete', old.rowid, old.title, old.content, old.author_username, old.submolt_name);
END;

CREATE TRIGGER IF NOT EXISTS fts_posts_au AFTER UPDATE ON cached_posts BEGIN
  INSERT INTO fts_posts(fts_posts, rowid, title, content, author_username, submolt_name)
  VALUES ('delete', old.rowid, old.title, old.content, old.author_username, old.submolt_name);
  INSERT INTO fts_posts(rowid, title, content, author_username, submolt_name)
  VALUES (new.rowid, new.title, new.content, new.author_username, new.submolt_name);
END;

-- Analytics Tables
CREATE TABLE IF NOT EXISTS karma_snapshots (
  id TEXT PRIMARY KEY,
  karma INTEGER NOT NULL DEFAULT 0,
  post_karma INTEGER NOT NULL DEFAULT 0,
  comment_karma INTEGER NOT NULL DEFAULT 0,
  follower_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_karma_snapshots_time ON karma_snapshots(recorded_at DESC);

CREATE TABLE IF NOT EXISTS post_performance (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  karma INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_post_perf_post ON post_performance(post_id);
CREATE INDEX IF NOT EXISTS idx_post_perf_time ON post_performance(recorded_at DESC);

-- User Subscriptions (persistent — never cleared by cache cleanup)
CREATE TABLE IF NOT EXISTS user_subscriptions (
  submolt_name TEXT PRIMARY KEY,
  subscribed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Saved Posts (persistent — user bookmarks, never cleared by cache cleanup)
CREATE TABLE IF NOT EXISTS saved_posts (
  post_id TEXT PRIMARY KEY,
  saved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Operational Tables
CREATE TABLE IF NOT EXISTS rate_limits (
  resource TEXT PRIMARY KEY,
  max_requests INTEGER NOT NULL,
  remaining INTEGER NOT NULL,
  reset_at TEXT NOT NULL DEFAULT (datetime('now', '+1 minute'))
);
INSERT OR IGNORE INTO rate_limits (resource, max_requests, remaining) VALUES
  ('moltbook_general', 100, 100),
  ('moltbook_posts', 1, 1),
  ('moltbook_comments', 50, 50),
  ('claude', 60, 60),
  ('openai', 60, 60),
  ('gemini', 60, 60),
  ('grok', 60, 60);

CREATE TABLE IF NOT EXISTS action_queue (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  reasoning TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  llm_provider TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_queue_status ON action_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON action_queue(priority DESC);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  activity_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  llm_provider TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'info',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_level ON activity_log(level);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_log(created_at DESC);

-- Engagement Tracking Tables (v3)
CREATE TABLE IF NOT EXISTS agent_engagements (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  comment_id TEXT,
  action_type TEXT NOT NULL,
  content_sent TEXT,
  persona_id TEXT NOT NULL DEFAULT 'default',
  reasoning TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_engagements_post ON agent_engagements(post_id);
CREATE INDEX IF NOT EXISTS idx_engagements_type ON agent_engagements(action_type);
CREATE INDEX IF NOT EXISTS idx_engagements_time ON agent_engagements(created_at DESC);

CREATE TABLE IF NOT EXISTS agent_content_performance (
  id TEXT PRIMARY KEY,
  post_id TEXT,
  comment_id TEXT,
  content_type TEXT NOT NULL,
  karma_at_creation INTEGER NOT NULL DEFAULT 0,
  karma_current INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_perf_post ON agent_content_performance(post_id);
CREATE INDEX IF NOT EXISTS idx_perf_time ON agent_content_performance(created_at DESC);

CREATE TABLE IF NOT EXISTS reply_inbox (
  id TEXT PRIMARY KEY,
  parent_post_id TEXT NOT NULL,
  parent_comment_id TEXT,
  agent_original_content TEXT,
  reply_comment_id TEXT NOT NULL UNIQUE,
  reply_author TEXT NOT NULL,
  reply_content TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  is_read INTEGER NOT NULL DEFAULT 0,
  agent_responded INTEGER NOT NULL DEFAULT 0,
  discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inbox_read ON reply_inbox(is_read);
CREATE INDEX IF NOT EXISTS idx_inbox_time ON reply_inbox(discovered_at DESC);

-- Token Usage Tracking (v8)
CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  persona_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_token_usage_time ON token_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_purpose ON token_usage(purpose);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider);
`

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return db
}

export function initDb(): Database.Database {
  const dbPath = join(app.getPath('userData'), 'moltvision.db')
  log.info(`Initializing database at: ${dbPath}`)

  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(SCHEMA_SQL)
  log.info('Database schema applied successfully')

  // --- One-time migrations ---
  const currentVersion = (db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as any)?.version ?? 1
  if (currentVersion < 2) {
    // v2: Clear stale posts cache that stored UUIDs as author names
    db.exec('DELETE FROM cached_posts')
    db.prepare('UPDATE schema_version SET version = 2, applied_at = datetime(\'now\') WHERE id = 1').run()
    log.info('Migration v2: Cleared stale posts cache (UUID author fix)')
  }
  if (currentVersion < 3) {
    // v3: Engagement tracking tables — schema already creates them via CREATE IF NOT EXISTS,
    // but we bump the version to track migration state
    db.prepare('UPDATE schema_version SET version = 3, applied_at = datetime(\'now\') WHERE id = 1').run()
    log.info('Migration v3: Engagement tracking tables (agent_engagements, agent_content_performance, reply_inbox)')
  }
  if (currentVersion < 4) {
    // v4: Add llm_provider column to agent_persona (for per-persona model selection)
    // ALTER TABLE ADD COLUMN is safe — SQLite won't error on existing columns via IF NOT EXISTS
    // but SQLite doesn't support IF NOT EXISTS on ALTER TABLE, so we check the schema first
    const cols = db.pragma('table_info(agent_persona)') as any[]
    if (!cols.some((c: any) => c.name === 'llm_provider')) {
      db.exec("ALTER TABLE agent_persona ADD COLUMN llm_provider TEXT NOT NULL DEFAULT 'claude'")
    }
    db.prepare('UPDATE schema_version SET version = 4, applied_at = datetime(\'now\') WHERE id = 1').run()
    log.info('Migration v4: Added llm_provider column to agent_persona')
  }
  if (currentVersion < 5) {
    const cols = db.pragma('table_info(user_preferences)') as any[]
    if (!cols.some((c: any) => c.name === 'active_persona_id')) {
      db.exec("ALTER TABLE user_preferences ADD COLUMN active_persona_id TEXT NOT NULL DEFAULT 'default'")
    }
    db.prepare('UPDATE schema_version SET version = 5, applied_at = datetime(\'now\') WHERE id = 1').run()
    log.info('Migration v5: Added active_persona_id to user_preferences')
  }
  if (currentVersion < 6) {
    const cols = db.pragma('table_info(user_preferences)') as any[]
    if (!cols.some((c: any) => c.name === 'suppress_sync_prompt')) {
      db.exec('ALTER TABLE user_preferences ADD COLUMN suppress_sync_prompt INTEGER NOT NULL DEFAULT 0')
    }
    db.prepare('UPDATE schema_version SET version = 6, applied_at = datetime(\'now\') WHERE id = 1').run()
    log.info('Migration v6: Added suppress_sync_prompt to user_preferences')
  }

  if (currentVersion < 7) {
    const cols = db.pragma('table_info(cached_submolts)') as any[]
    if (!cols.some((c: any) => c.name === 'your_role')) {
      db.exec('ALTER TABLE cached_submolts ADD COLUMN your_role TEXT')
    }
    db.prepare('UPDATE schema_version SET version = 7, applied_at = datetime(\'now\') WHERE id = 1').run()
    log.info('Migration v7: Added your_role to cached_submolts')
  }

  if (currentVersion < 8) {
    // v8: Token usage tracking table — schema already creates it via CREATE IF NOT EXISTS
    db.prepare('UPDATE schema_version SET version = 8, applied_at = datetime(\'now\') WHERE id = 1').run()
    log.info('Migration v8: Token usage tracking table')
  }

  if (currentVersion < 9) {
    const cols = db.pragma('table_info(user_preferences)') as any[]
    if (!cols.some((c: any) => c.name === 'theme_custom_colors')) {
      db.exec('ALTER TABLE user_preferences ADD COLUMN theme_custom_colors TEXT')
    }
    db.prepare('UPDATE schema_version SET version = 9, applied_at = datetime(\'now\') WHERE id = 1').run()
    log.info('Migration v9: Added theme_custom_colors to user_preferences')
  }

  // --- Startup cleanup: session-scoped caches start fresh ---
  // Preserve submolts where user has a role (owner/moderator) — only clear generic cached submolts
  const submoltsCleared = db.prepare(`DELETE FROM cached_submolts WHERE your_role IS NULL`).run().changes
  const postsExpired = db.prepare(`DELETE FROM cached_posts WHERE cached_at < datetime('now', '-3 days')`).run().changes
  const commentsExpired = db.prepare(`DELETE FROM cached_comments WHERE cached_at < datetime('now', '-7 days')`).run().changes
  const agentsExpired = db.prepare(`DELETE FROM cached_agents WHERE cached_at < datetime('now', '-7 days')`).run().changes
  if (submoltsCleared || postsExpired || commentsExpired || agentsExpired) {
    log.info(`Startup cache cleanup: cleared ${submoltsCleared} submolts, expired ${postsExpired} posts, ${commentsExpired} comments, ${agentsExpired} agents`)
  }

  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    log.info('Database closed')
  }
}

export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[]
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined
}

export function run(sql: string, params: unknown[] = []): Database.RunResult {
  return getDb().prepare(sql).run(...params)
}

export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)()
}
