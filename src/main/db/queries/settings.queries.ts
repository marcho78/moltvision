import { queryOne, run } from '../index'
import type { LLMProviderName, UserPreferences } from '../../../shared/domain.types'

export function getPreferences(): UserPreferences {
  const row = queryOne<any>('SELECT * FROM user_preferences WHERE id = 1')
  return {
    active_llm: row?.active_llm ?? 'claude',
    fallback_llm: row?.fallback_llm ?? null,
    panel_layout: JSON.parse(row?.panel_layout ?? '{}'),
    theme: row?.theme ?? 'dark',
    operation_mode: row?.operation_mode ?? 'off',
    heartbeat_interval: row?.heartbeat_interval ?? 15000,
    llm_temperature: row?.llm_temperature ?? 0.7,
    max_tokens: row?.max_tokens ?? 1024,
    active_persona_id: row?.active_persona_id ?? 'default'
  }
}

export function savePreferences(prefs: Partial<UserPreferences>): void {
  const current = getPreferences()
  const merged = { ...current, ...prefs }
  run(
    `UPDATE user_preferences SET
      active_llm = ?, fallback_llm = ?, panel_layout = ?, theme = ?,
      operation_mode = ?, heartbeat_interval = ?, llm_temperature = ?, max_tokens = ?,
      active_persona_id = ?
    WHERE id = 1`,
    [
      merged.active_llm, merged.fallback_llm, JSON.stringify(merged.panel_layout),
      merged.theme, merged.operation_mode, merged.heartbeat_interval,
      merged.llm_temperature, merged.max_tokens, merged.active_persona_id
    ]
  )
}

export function getApiKey(provider: string): Buffer | null {
  const row = queryOne<{ encrypted_key: Buffer }>('SELECT encrypted_key FROM api_keys WHERE provider = ?', [provider])
  return row?.encrypted_key ?? null
}

export function saveApiKey(provider: string, encryptedKey: Buffer): void {
  run(
    `INSERT INTO api_keys (provider, encrypted_key, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(provider) DO UPDATE SET encrypted_key = excluded.encrypted_key, updated_at = excluded.updated_at`,
    [provider, encryptedKey]
  )
}

export function getConfiguredProviders(): string[] {
  const rows = queryOne<any>('SELECT GROUP_CONCAT(provider) as providers FROM api_keys')
  return rows?.providers ? rows.providers.split(',') : []
}
