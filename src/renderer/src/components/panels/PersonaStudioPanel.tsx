import React, { useEffect, useState } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { AgentPersona, ToneSettings, EngagementRules, LLMProviderName } from '@shared/domain.types'

const LLM_PROVIDERS: { id: LLMProviderName; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'grok', label: 'Grok' }
]

function ToneSliders({ tone, onChange }: { tone: ToneSettings; onChange: (t: ToneSettings) => void }) {
  const styles = ['casual', 'formal', 'witty', 'academic', 'friendly'] as const
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Tone</h4>
      <div className="flex gap-1">
        {styles.map((s) => (
          <button
            key={s}
            onClick={() => onChange({ ...tone, style: s })}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              tone.style === s ? 'bg-molt-accent text-white' : 'bg-molt-surface text-molt-muted hover:text-molt-text'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <div>
        <label className="text-xs text-molt-muted">Temperature: {tone.temperature.toFixed(2)}</label>
        <input type="range" min="0" max="1" step="0.05" value={tone.temperature}
          onChange={(e) => onChange({ ...tone, temperature: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>
      <div>
        <label className="text-xs text-molt-muted">Max Length: {tone.max_length}</label>
        <input type="range" min="50" max="2000" step="50" value={tone.max_length}
          onChange={(e) => onChange({ ...tone, max_length: parseInt(e.target.value) })}
          className="w-full"
        />
      </div>
    </div>
  )
}

function InterestTags({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('')
  const addTag = () => {
    if (input.trim() && !tags.includes(input.trim())) {
      onChange([...tags, input.trim()])
      setInput('')
    }
  }
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Interest Tags</h4>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span key={tag} className="badge bg-molt-accent/20 text-molt-accent text-xs flex items-center gap-1">
            {tag}
            <button onClick={() => onChange(tags.filter((t) => t !== tag))} className="hover:text-white">&times;</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTag()}
          placeholder="Add tag..." className="input-field flex-1 text-sm" />
        <button onClick={addTag} className="btn-secondary text-sm">Add</button>
      </div>
    </div>
  )
}

function EngagementRulesEditor({ rules, onChange }: { rules: EngagementRules; onChange: (r: EngagementRules) => void }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Engagement Rules</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-molt-muted">Engagement Rate: {(rules.engagement_rate * 100).toFixed(0)}%</label>
          <input type="range" min="0" max="1" step="0.05" value={rules.engagement_rate}
            onChange={(e) => onChange({ ...rules, engagement_rate: parseFloat(e.target.value) })}
            className="w-full" />
        </div>
        <div>
          <label className="text-xs text-molt-muted">Min Karma: {rules.min_karma_threshold}</label>
          <input type="range" min="-100" max="100" step="1" value={rules.min_karma_threshold}
            onChange={(e) => onChange({ ...rules, min_karma_threshold: parseInt(e.target.value) })}
            className="w-full" />
        </div>
        <div>
          <label className="text-xs text-molt-muted">Max Posts/Hour: {rules.max_posts_per_hour}</label>
          <input type="range" min="0" max="10" step="1" value={rules.max_posts_per_hour}
            onChange={(e) => onChange({ ...rules, max_posts_per_hour: parseInt(e.target.value) })}
            className="w-full" />
        </div>
        <div>
          <label className="text-xs text-molt-muted">Max Comments/Hour: {rules.max_comments_per_hour}</label>
          <input type="range" min="0" max="30" step="1" value={rules.max_comments_per_hour}
            onChange={(e) => onChange({ ...rules, max_comments_per_hour: parseInt(e.target.value) })}
            className="w-full" />
        </div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs text-molt-muted">
          <input type="checkbox" checked={rules.reply_to_replies}
            onChange={(e) => onChange({ ...rules, reply_to_replies: e.target.checked })} />
          Reply to replies
        </label>
        <label className="flex items-center gap-2 text-xs text-molt-muted">
          <input type="checkbox" checked={rules.avoid_controversial}
            onChange={(e) => onChange({ ...rules, avoid_controversial: e.target.checked })} />
          Avoid controversial
        </label>
      </div>
    </div>
  )
}

function SubmoltPriorityEditor({ priorities, onChange }: {
  priorities: Record<string, number>; onChange: (p: Record<string, number>) => void
}) {
  const [addInput, setAddInput] = useState('')
  const { submolts, setSubmolts } = useStore()
  const entries = Object.entries(priorities).sort(([, a], [, b]) => b - a)

  // Load submolts if not already loaded
  useEffect(() => {
    if (submolts.length === 0) {
      invoke<{ submolts: any[] }>(IPC.SUBMOLTS_LIST)
        .then((result: any) => {
          const list = Array.isArray(result) ? result : (result?.submolts ?? [])
          if (list.length > 0) setSubmolts(list)
        })
        .catch(() => {})
    }
  }, [submolts.length, setSubmolts])

  const subscribedSubmolts = submolts.filter((s: any) => s.is_subscribed)

  const addSubmolt = (name: string) => {
    const clean = name.trim().replace(/^m\//, '')
    if (!clean || priorities[clean] !== undefined) return
    onChange({ ...priorities, [clean]: 5 })
    setAddInput('')
  }

  const removeSubmolt = (name: string) => {
    const next = { ...priorities }
    delete next[name]
    onChange(next)
  }

  const setPriority = (name: string, value: number) => {
    onChange({ ...priorities, [name]: value })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Submolt Priorities</h4>
        <span className="text-[10px] text-molt-muted">{entries.length} active</span>
      </div>
      <p className="text-[10px] text-molt-muted">
        The autopilot will focus on these submolts. Higher priority = more attention. The agent will also create original posts in these submolts.
      </p>

      {/* Quick add from subscriptions */}
      {subscribedSubmolts.length > 0 && (
        <div className="space-y-1">
          <label className="text-[10px] text-molt-muted">Add from your subscriptions:</label>
          <div className="flex flex-wrap gap-1">
            {subscribedSubmolts
              .filter((s: any) => priorities[s.name] === undefined)
              .slice(0, 12)
              .map((s: any) => (
                <button key={s.name} onClick={() => addSubmolt(s.name)}
                  className="px-2 py-0.5 text-[10px] rounded-full bg-molt-surface text-molt-muted hover:text-molt-text hover:bg-molt-accent/10 border border-molt-border transition-colors">
                  + m/{s.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Manual add */}
      <div className="flex gap-2">
        <input value={addInput} onChange={(e) => setAddInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSubmolt(addInput)}
          placeholder="Add submolt name..." className="input-field flex-1 text-sm" />
        <button onClick={() => addSubmolt(addInput)} className="btn-secondary text-sm">Add</button>
      </div>

      {/* Priority list */}
      {entries.length === 0 && (
        <div className="text-xs text-molt-muted text-center py-3 bg-molt-bg rounded-lg">
          No submolts configured. Add submolts above to direct the agent.
        </div>
      )}
      <div className="space-y-2">
        {entries.map(([name, priority]) => (
          <div key={name} className="flex items-center gap-2 bg-molt-bg rounded-lg px-3 py-2">
            <span className="text-xs font-medium text-molt-text w-28 truncate" title={`m/${name}`}>m/{name}</span>
            <input type="range" min="1" max="10" step="1" value={priority}
              onChange={(e) => setPriority(name, parseInt(e.target.value))}
              className="flex-1" />
            <span className="text-xs text-molt-muted w-6 text-center">{priority}</span>
            <button onClick={() => removeSubmolt(name)}
              className="text-molt-muted hover:text-molt-error text-sm transition-colors">&times;</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function LLMProviderSelector({ value, onChange, label }: {
  value: LLMProviderName; onChange: (provider: LLMProviderName) => void; label: string
}) {
  return (
    <div>
      <label className="text-xs text-molt-muted">{label}</label>
      <div className="flex gap-1 mt-1">
        {LLM_PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              value === p.id
                ? 'bg-molt-accent text-white'
                : 'bg-molt-surface text-molt-muted hover:text-molt-text border border-molt-border'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function PersonaStudioPanel() {
  const { activePersona, savedPersonas, personaDirty, setActivePersona, setSavedPersonas, setPersonaDirty, addNotification } = useStore()
  const [preview, setPreview] = useState('')
  const [previewProvider, setPreviewProvider] = useState<LLMProviderName | null>(null)
  const [previewUsedProvider, setPreviewUsedProvider] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [whoami, setWhoami] = useState<{ identity: string; provider: string; model: string; latency_ms: number } | null>(null)
  const [whoamiLoading, setWhoamiLoading] = useState(false)

  useEffect(() => {
    invoke<AgentPersona[]>(IPC.PERSONA_LIST)
      .then((personas) => {
        setSavedPersonas(personas as any)
        if (!activePersona && personas.length > 0) setActivePersona((personas as any)[0])
      })
      .catch(console.error)
  }, [setSavedPersonas, setActivePersona, activePersona])

  const handleSave = async () => {
    if (!activePersona) return
    try {
      await invoke(IPC.PERSONA_SAVE, { persona: activePersona })
      setPersonaDirty(false)
      addNotification('Persona saved!', 'success')
      const personas = await invoke<AgentPersona[]>(IPC.PERSONA_LIST)
      setSavedPersonas(personas as any)
    } catch (err: any) {
      addNotification(err.message || 'Save failed', 'error')
    }
  }

  const handlePreview = async () => {
    if (!activePersona) return
    setPreviewing(true)
    try {
      const result = await invoke<{ preview_response: string; provider_used?: string }>(IPC.PERSONA_GENERATE_PREVIEW, {
        persona: activePersona,
        sample_post: { title: 'What is your take on AI agents?', content: 'I think AI agents are the future of social networks.' },
        provider: previewProvider ?? undefined
      })
      setPreview(result.preview_response)
      setPreviewUsedProvider(result.provider_used ?? null)
    } catch (err: any) {
      addNotification(err.message || 'Preview failed', 'error')
    } finally {
      setPreviewing(false)
    }
  }

  const updatePersona = (updates: Partial<AgentPersona>) => {
    if (!activePersona) return
    setActivePersona({ ...activePersona, ...updates } as AgentPersona)
    setPersonaDirty(true)
  }

  const handleWhoami = async (provider?: LLMProviderName) => {
    setWhoamiLoading(true)
    setWhoami(null)
    try {
      const result = await invoke<{ identity: string | null; provider: string; model: string; latency_ms: number; error?: string }>(
        IPC.LLM_WHOAMI, { provider }
      )
      if (result.error) {
        addNotification(result.error, 'error')
      } else {
        setWhoami({ identity: result.identity!, provider: result.provider, model: result.model, latency_ms: result.latency_ms })
      }
    } catch (err: any) {
      addNotification(err.message || 'Who Am I failed', 'error')
    } finally {
      setWhoamiLoading(false)
    }
  }

  if (!activePersona) {
    return (
      <div className="h-full flex items-center justify-center text-molt-muted">
        Loading persona...
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Persona Studio
          {personaDirty && <span className="text-molt-warning text-xs ml-2">(unsaved)</span>}
        </h2>
        <div className="flex gap-2">
          <button onClick={handlePreview} className="btn-secondary text-sm" disabled={previewing}>
            {previewing ? 'Generating...' : 'Preview'}
          </button>
          <button onClick={handleSave} className="btn-primary text-sm" disabled={!personaDirty}>Save</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-molt-muted">Name</label>
            <input value={activePersona.name} onChange={(e) => updatePersona({ name: e.target.value })}
              className="input-field w-full text-sm" />
          </div>
          <div>
            <label className="text-xs text-molt-muted">Description</label>
            <input value={activePersona.description} onChange={(e) => updatePersona({ description: e.target.value })}
              className="input-field w-full text-sm" />
          </div>
        </div>

        {/* LLM Model — saved with persona, used by autopilot */}
        <div className="panel-card space-y-3">
          <LLMProviderSelector
            value={activePersona.llm_provider ?? 'claude'}
            onChange={(llm_provider) => { updatePersona({ llm_provider }); setWhoami(null) }}
            label="LLM Model (used by autopilot for this persona)"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleWhoami(activePersona.llm_provider ?? 'claude')}
              className="btn-secondary text-xs py-1 px-3"
              disabled={whoamiLoading}
            >
              {whoamiLoading ? 'Asking...' : 'Who Am I?'}
            </button>
            <p className="text-[10px] text-molt-muted">
              Ask the selected model to identify itself
            </p>
          </div>
          {whoami && (
            <div className="bg-molt-bg rounded-lg p-3 space-y-1">
              <p className="text-sm text-molt-text">{whoami.identity}</p>
              <div className="flex gap-3 text-[10px] text-molt-muted">
                <span>Provider: {LLM_PROVIDERS.find(p => p.id === whoami.provider)?.label ?? whoami.provider}</span>
                <span>Model: {whoami.model}</span>
                <span>{whoami.latency_ms}ms</span>
              </div>
            </div>
          )}
        </div>

        <ToneSliders tone={activePersona.tone_settings} onChange={(tone_settings) => updatePersona({ tone_settings })} />
        <InterestTags tags={activePersona.interest_tags} onChange={(interest_tags) => updatePersona({ interest_tags })} />
        <EngagementRulesEditor rules={activePersona.engagement_rules} onChange={(engagement_rules) => updatePersona({ engagement_rules })} />
        <SubmoltPriorityEditor priorities={activePersona.submolt_priorities} onChange={(submolt_priorities) => updatePersona({ submolt_priorities })} />

        <div>
          <h4 className="text-sm font-medium mb-2">System Prompt</h4>
          <textarea value={activePersona.system_prompt}
            onChange={(e) => updatePersona({ system_prompt: e.target.value })}
            rows={6} className="input-field w-full text-sm font-mono resize-none" />
        </div>

        {/* Preview Section */}
        <div className="panel-card space-y-3">
          <h4 className="text-sm font-medium">Test Preview</h4>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-molt-muted mb-1 block">Test with model</label>
              <div className="flex gap-1">
                <button
                  onClick={() => setPreviewProvider(null)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                    previewProvider === null
                      ? 'bg-molt-accent text-white'
                      : 'bg-molt-surface text-molt-muted hover:text-molt-text border border-molt-border'
                  }`}
                >
                  Persona Default ({LLM_PROVIDERS.find(p => p.id === (activePersona.llm_provider ?? 'claude'))?.label})
                </button>
                {LLM_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPreviewProvider(p.id)}
                    className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                      previewProvider === p.id
                        ? 'bg-molt-accent text-white'
                        : 'bg-molt-surface text-molt-muted hover:text-molt-text border border-molt-border'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handlePreview} className="btn-secondary text-xs py-1.5 px-3 shrink-0" disabled={previewing}>
              {previewing ? 'Running...' : 'Run Preview'}
            </button>
          </div>

          {preview && (
            <div className="bg-molt-bg rounded-lg p-3 mt-2">
              {previewUsedProvider && (
                <div className="text-[10px] text-molt-muted mb-1.5">
                  Generated with: {LLM_PROVIDERS.find(p => p.id === previewUsedProvider)?.label ?? previewUsedProvider}
                </div>
              )}
              <p className="text-sm text-molt-text whitespace-pre-wrap">{preview}</p>
            </div>
          )}
        </div>

        {savedPersonas.length > 1 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Saved Personas</h4>
            <div className="space-y-1">
              {savedPersonas.map((p) => (
                <button key={p.id} onClick={() => setActivePersona(p)}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between ${
                    activePersona.id === p.id ? 'bg-molt-accent/10 text-molt-accent' : 'text-molt-muted hover:bg-molt-surface'
                  }`}>
                  <span>{p.name}</span>
                  <span className="text-[10px] opacity-60">
                    {LLM_PROVIDERS.find(pr => pr.id === p.llm_provider)?.label ?? p.llm_provider ?? 'claude'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
