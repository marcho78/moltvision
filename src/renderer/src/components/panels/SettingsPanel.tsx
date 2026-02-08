import React, { useEffect, useState, useRef } from 'react'
import { useStore } from '../../stores'
import { invoke, on } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { LLMProviderName, ApiKeyStatus, ThemeColors, ThemePresetId } from '@shared/domain.types'
import { THEME_PRESETS, THEME_TOKEN_LABELS, resolveThemeColors } from '@shared/theme-presets'
import { applyThemeToDOM } from '../../hooks/useTheme'

function ApiKeyInput({ provider, status, onKeySaved }: { provider: string; status: ApiKeyStatus; onKeySaved: () => void }) {
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const { addNotification, setConnectionStatus } = useStore()

  const handleSave = async () => {
    if (!key.trim()) return
    try {
      await invoke(IPC.SETTINGS_SAVE_API_KEY, { provider, key })
      addNotification(`${provider} API key saved`, 'success')
      setKey('')
      onKeySaved()
    } catch (err: any) {
      addNotification(err.message || 'Failed to save key', 'error')
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await invoke<{ result: { valid: boolean } }>(IPC.SETTINGS_TEST_CONNECTION, { provider })
      setTestResult(result.result.valid)
      setConnectionStatus(provider, result.result.valid)
      addNotification(result.result.valid ? `${provider} connected!` : `${provider} connection failed`, result.result.valid ? 'success' : 'error')
    } catch {
      setTestResult(false)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="panel-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{provider}</span>
          <div className={`w-2 h-2 rounded-full ${status.configured ? 'bg-molt-success' : 'bg-molt-muted'}`} />
          {testResult !== null && (
            <span className={`text-xs ${testResult ? 'text-molt-success' : 'text-molt-error'}`}>
              {testResult ? 'Connected' : 'Failed'}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)}
          placeholder={status.configured ? '••••••••' : 'Enter API key...'}
          className="input-field flex-1 text-sm" />
        <button onClick={handleSave} className="btn-primary text-xs" disabled={!key.trim()}>Save</button>
        <button onClick={handleTest} className="btn-secondary text-xs" disabled={testing}>
          {testing ? 'Testing...' : 'Test'}
        </button>
      </div>
    </div>
  )
}

function MoltbookRegister() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [registering, setRegistering] = useState(false)
  const [result, setResult] = useState<{ api_key: string; claim_url: string; verification_code: string; profile_url?: string; tweet_template?: string } | null>(null)
  const { addNotification } = useStore()

  const handleRegister = async () => {
    if (!name.trim()) return
    setRegistering(true)
    try {
      const res = await invoke<any>(IPC.AGENTS_REGISTER, { name: name.trim(), description: description.trim() })
      if (!res?.api_key) {
        throw new Error('Unexpected response — no api_key returned')
      }
      setResult(res)
      // Auto-save the key
      await invoke(IPC.SETTINGS_SAVE_API_KEY, { provider: 'moltbook', key: res.api_key })
      addNotification('Agent registered! API key saved automatically.', 'success')
    } catch (err: any) {
      addNotification(err.message || 'Registration failed', 'error')
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="panel-card p-3 space-y-3">
      <h3 className="text-sm font-medium">Register New Agent</h3>
      <p className="text-xs text-molt-muted">Don't have a Moltbook API key? Register an agent to get one.</p>
      {result ? (
        <div className="space-y-2">
          <div className="bg-molt-success/10 border border-molt-success/30 rounded-lg p-3 space-y-1">
            <div className="text-xs text-molt-muted">API Key (saved automatically):</div>
            <div className="text-xs font-mono text-molt-text break-all">{result.api_key}</div>
          </div>
          <div className="bg-molt-surface rounded-lg p-3 space-y-1">
            <div className="text-xs text-molt-muted">Verification Code:</div>
            <div className="text-sm font-mono font-bold text-molt-accent">{result.verification_code}</div>
          </div>
          {result.claim_url && (
            <div className="bg-molt-surface rounded-lg p-3 space-y-1">
              <div className="text-xs text-molt-muted">Claim URL (send to your human):</div>
              <div className="text-xs font-mono text-molt-info break-all">{result.claim_url}</div>
            </div>
          )}
          {result.profile_url && (
            <div className="bg-molt-surface rounded-lg p-3 space-y-1">
              <div className="text-xs text-molt-muted">Profile URL:</div>
              <div className="text-xs font-mono text-molt-info break-all">{result.profile_url}</div>
            </div>
          )}
          {result.tweet_template && (
            <div className="bg-molt-surface rounded-lg p-3 space-y-1">
              <div className="text-xs text-molt-muted">Tweet to verify:</div>
              <div className="text-xs text-molt-text whitespace-pre-wrap">{result.tweet_template}</div>
            </div>
          )}
          <button onClick={() => setResult(null)} className="btn-secondary text-xs">Done</button>
        </div>
      ) : (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Agent name (e.g. MyCoolBot)"
            className="input-field w-full text-sm" />
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="input-field w-full text-sm" />
          <button onClick={handleRegister} className="btn-primary text-sm" disabled={registering || !name.trim()}>
            {registering ? 'Registering...' : 'Register Agent'}
          </button>
        </>
      )}
    </div>
  )
}

function SubmoltDatabase() {
  const [status, setStatus] = useState<{ cached: number; total: number; syncing: boolean; phase: string }>({
    cached: 0, total: 0, syncing: false, phase: ''
  })
  const { addNotification } = useStore()

  // Check initial status
  useEffect(() => {
    invoke<{ total_cached: number; syncing: boolean }>(IPC.SUBMOLTS_SEARCH_CACHED, { keyword: '', limit: 1 })
      .then((resp) => {
        setStatus(prev => ({ ...prev, cached: resp?.total_cached ?? 0, syncing: resp?.syncing ?? false }))
      })
      .catch(() => {})
  }, [])

  // Listen for progress updates
  useEffect(() => {
    return on(IPC.SUBMOLTS_CACHE_STATUS, (s: unknown) => {
      const data = s as { syncing: boolean; cached: number; total: number; phase: string }
      setStatus(data)
      if (!data.syncing && data.cached > 0 && data.phase === 'Up to date') {
        addNotification(`Submolt database updated: ${data.cached.toLocaleString()} communities`, 'success')
      }
    })
  }, [addNotification])

  const handleSync = () => {
    invoke(IPC.SUBMOLTS_CACHE_SYNC, { force: false }).catch(() => {})
    setStatus(prev => ({ ...prev, syncing: true, phase: 'Starting...' }))
  }

  const handleForceSync = () => {
    invoke(IPC.SUBMOLTS_CACHE_SYNC, { force: true }).catch(() => {})
    setStatus(prev => ({ ...prev, syncing: true, phase: 'Starting full re-sync...' }))
  }

  return (
    <div className="panel-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Submolt Database</h3>
        {status.cached > 0 && !status.syncing && (
          <span className="text-[10px] text-molt-success flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-molt-success" />
            Synced
          </span>
        )}
      </div>

      <p className="text-xs text-molt-muted">
        {status.cached > 0
          ? `${status.cached.toLocaleString()} communities cached locally. Search and browse submolts from the Feed panel or Search filters.`
          : 'Sync the submolt database to search and browse communities by name. This is a one-time download that stays in your local database. You can still use the app while syncing.'}
      </p>

      {/* Progress bar during sync */}
      {status.syncing && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
              className="animate-spin text-molt-accent shrink-0" strokeLinecap="round">
              <path d="M14 8A6 6 0 112.5 5.5" />
            </svg>
            <span className="text-xs text-molt-muted">{status.phase}</span>
          </div>
          {status.total > 0 && (
            <div className="w-full h-1.5 bg-molt-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-molt-accent rounded-full transition-all duration-500"
                style={{ width: `${Math.min((status.cached / status.total) * 100, 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSync}
          disabled={status.syncing}
          className="btn-primary text-xs"
        >
          {status.syncing ? 'Syncing...' : status.cached > 0 ? 'Update Submolts' : 'Sync Submolts'}
        </button>
        {status.cached > 0 && !status.syncing && (
          <button
            onClick={handleForceSync}
            className="btn-secondary text-xs"
          >
            Full Re-sync
          </button>
        )}
      </div>
    </div>
  )
}

function LlmSelector() {
  const { activeLlm, setActiveLlm, addNotification } = useStore()
  const providers: LLMProviderName[] = ['claude', 'openai', 'gemini', 'grok']

  return (
    <div className="panel-card">
      <h3 className="text-sm font-medium mb-3">Active LLM Provider</h3>
      <div className="flex gap-0.5 bg-molt-bg rounded-lg p-0.5 max-w-sm">
        {providers.map((p) => (
          <button key={p} onClick={() => setActiveLlm(p)}
            className={`flex-1 px-3 py-2 rounded-md text-xs capitalize transition-all ${
              activeLlm === p ? 'bg-molt-surface text-molt-accent font-medium shadow-sm' : 'text-molt-muted hover:text-molt-text'
            }`}>
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

const SWATCH_KEYS: (keyof ThemeColors)[] = ['bg', 'accent', 'text', 'surface']
const ALL_TOKEN_KEYS = Object.keys(THEME_TOKEN_LABELS) as (keyof ThemeColors)[]

function ThemePreferences() {
  const { theme, themeCustomColors, setTheme, setThemeCustomColors, addNotification } = useStore()
  const [showCustomize, setShowCustomize] = useState(false)
  const [localColors, setLocalColors] = useState<ThemeColors>(() => resolveThemeColors(theme, themeCustomColors))
  const [dirty, setDirty] = useState(false)
  const savedThemeRef = useRef(theme)
  const savedCustomRef = useRef(themeCustomColors)

  // When store theme changes externally (e.g. on load), sync local state
  useEffect(() => {
    savedThemeRef.current = theme
    savedCustomRef.current = themeCustomColors
    setLocalColors(resolveThemeColors(theme, themeCustomColors))
    setDirty(false)
  }, [theme, themeCustomColors])

  const selectPreset = (id: ThemePresetId) => {
    const preset = THEME_PRESETS.find((p) => p.id === id)!
    setLocalColors(preset.colors)
    // Apply live preview immediately
    setTheme(id)
    setThemeCustomColors(null)
    applyThemeToDOM(preset.colors)
    setShowCustomize(false)
    setDirty(true)
  }

  const updateToken = (key: keyof ThemeColors, value: string) => {
    const next = { ...localColors, [key]: value }
    setLocalColors(next)
    setTheme('custom')
    setThemeCustomColors(next)
    applyThemeToDOM(next)
    setDirty(true)
  }

  const handleSave = async () => {
    try {
      const storeTheme = useStore.getState().theme
      await invoke(IPC.SETTINGS_SAVE_PREFERENCES, {
        theme: storeTheme,
        theme_custom_colors: storeTheme === 'custom' ? localColors : null
      })
      savedThemeRef.current = storeTheme
      savedCustomRef.current = storeTheme === 'custom' ? localColors : null
      setDirty(false)
      addNotification('Theme saved', 'success')
    } catch {
      addNotification('Failed to save theme', 'error')
    }
  }

  const handleReset = () => {
    const colors = resolveThemeColors(savedThemeRef.current, savedCustomRef.current)
    setTheme(savedThemeRef.current)
    setThemeCustomColors(savedCustomRef.current)
    setLocalColors(colors)
    applyThemeToDOM(colors)
    setDirty(false)
  }

  return (
    <div className="space-y-4">
      <div className="panel-card">
        <h3 className="text-sm font-medium mb-3">Theme</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {THEME_PRESETS.map((preset) => {
            const active = theme === preset.id && theme !== 'custom'
            return (
              <button
                key={preset.id}
                onClick={() => selectPreset(preset.id)}
                className={`relative rounded-lg border p-3 text-left transition-all ${
                  active
                    ? 'border-molt-accent ring-1 ring-molt-accent/40'
                    : 'border-molt-border hover:border-molt-muted'
                }`}
              >
                {/* 4-swatch preview */}
                <div className="flex gap-1 mb-2">
                  {SWATCH_KEYS.map((k) => (
                    <div
                      key={k}
                      className="w-5 h-5 rounded-sm border border-black/20"
                      style={{ backgroundColor: preset.colors[k] }}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium">{preset.name}</span>
                {active && (
                  <div className="absolute top-1.5 right-1.5">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-molt-accent">
                      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.7 5.3l-4 4a1 1 0 01-1.4 0l-2-2a1 1 0 011.4-1.4L7 8.2l3.3-3.3a1 1 0 011.4 1.4z" />
                    </svg>
                  </div>
                )}
              </button>
            )
          })}

          {/* Custom card */}
          <button
            onClick={() => setShowCustomize((v) => !v)}
            className={`relative rounded-lg border p-3 text-left transition-all ${
              theme === 'custom'
                ? 'border-molt-accent ring-1 ring-molt-accent/40'
                : 'border-molt-border hover:border-molt-muted'
            }`}
          >
            <div className="flex gap-1 mb-2">
              {SWATCH_KEYS.map((k) => (
                <div
                  key={k}
                  className="w-5 h-5 rounded-sm border border-black/20"
                  style={{ backgroundColor: localColors[k] }}
                />
              ))}
            </div>
            <span className="text-xs font-medium">Custom</span>
            {theme === 'custom' && (
              <div className="absolute top-1.5 right-1.5">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-molt-accent">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.7 5.3l-4 4a1 1 0 01-1.4 0l-2-2a1 1 0 011.4-1.4L7 8.2l3.3-3.3a1 1 0 011.4 1.4z" />
                </svg>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Custom color editor */}
      {showCustomize && (
        <div className="panel-card">
          <h3 className="text-sm font-medium mb-3">Customize Colors</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_TOKEN_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={localColors[key]}
                  onChange={(e) => updateToken(key, e.target.value)}
                  className="w-7 h-7 rounded border border-molt-border cursor-pointer bg-transparent p-0"
                />
                <span className="text-xs text-molt-muted flex-1">{THEME_TOKEN_LABELS[key]}</span>
                <input
                  type="text"
                  value={localColors[key]}
                  onChange={(e) => {
                    const v = e.target.value
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) updateToken(key, v)
                  }}
                  className="input-field text-xs w-20 py-1 px-2 font-mono"
                  maxLength={7}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Save / Reset */}
      {dirty && (
        <div className="flex gap-2">
          <button onClick={handleSave} className="btn-primary text-sm">Save Theme</button>
          <button onClick={handleReset} className="btn-secondary text-sm">Discard</button>
        </div>
      )}
    </div>
  )
}

export function SettingsPanel() {
  const { apiKeys, setApiKeys, setPreferences, addNotification } = useStore()
  const [activeTab, setActiveTab] = useState<'api' | 'llm' | 'preferences' | 'data' | 'about'>('api')

  const refreshSettings = () => {
    invoke<{ preferences: any; api_keys: ApiKeyStatus[] }>(IPC.SETTINGS_GET_ALL)
      .then((result) => {
        setApiKeys(result.api_keys)
        setPreferences(result.preferences)
      })
      .catch(console.error)
  }

  useEffect(() => {
    refreshSettings()
  }, [setApiKeys, setPreferences])

  const tabs = [
    { id: 'api' as const, label: 'API Keys' },
    { id: 'llm' as const, label: 'LLM Provider' },
    { id: 'preferences' as const, label: 'Preferences' },
    { id: 'data' as const, label: 'Data' },
    { id: 'about' as const, label: 'About' }
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border">
        <h2 className="text-lg font-semibold">Settings</h2>
        <div className="flex gap-1 mt-2">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs rounded-lg ${
                activeTab === tab.id ? 'bg-molt-accent text-white' : 'text-molt-muted hover:bg-molt-surface'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4"><div className="max-w-2xl mx-auto space-y-3">
        {activeTab === 'api' && (
          <>
            <MoltbookRegister />
            {['moltbook', 'claude', 'openai', 'gemini', 'grok'].map((provider) => {
              const status = apiKeys.find((k) => k.provider === provider) ?? { provider, configured: false, valid: null, last_tested: null }
              return <ApiKeyInput key={provider} provider={provider} status={status} onKeySaved={refreshSettings} />
            })}
          </>
        )}
        {activeTab === 'llm' && <LlmSelector />}
        {activeTab === 'preferences' && <ThemePreferences />}
        {activeTab === 'data' && (
          <div className="space-y-3">
            <SubmoltDatabase />
            <div className="panel-card">
              <h3 className="text-sm font-medium mb-3">Data Management</h3>
              <div className="flex gap-2">
                <button onClick={async () => {
                  const result = await invoke<{ data: string; filename: string }>(IPC.SETTINGS_EXPORT)
                  addNotification(`Exported: ${result.filename}`, 'success')
                }} className="btn-secondary text-sm">Export Settings</button>
                <button onClick={async () => {
                  await invoke(IPC.SETTINGS_CLEAR_CACHE)
                  addNotification('Cache cleared', 'info')
                }} className="btn-danger text-sm">Clear Cache</button>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'about' && (
          <div className="panel-card text-center py-8">
            <div className="w-12 h-12 rounded-full bg-molt-accent mx-auto mb-3 flex items-center justify-center text-white text-xl font-bold">M</div>
            <h3 className="text-lg font-bold">MoltVision</h3>
            <p className="text-sm text-molt-muted">v1.0.0</p>
            <p className="text-xs text-molt-muted mt-2">All-in-one AI agent for Moltbook</p>
          </div>
        )}
      </div></div>
    </div>
  )
}
