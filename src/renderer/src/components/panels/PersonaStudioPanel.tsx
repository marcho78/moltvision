import React, { useEffect, useState } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { AgentPersona, ToneSettings, EngagementRules } from '@shared/domain.types'

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

export function PersonaStudioPanel() {
  const { activePersona, savedPersonas, personaDirty, setActivePersona, setSavedPersonas, setPersonaDirty, addNotification } = useStore()
  const [preview, setPreview] = useState('')

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
    try {
      const result = await invoke<{ preview_response: string }>(IPC.PERSONA_GENERATE_PREVIEW, {
        persona: activePersona,
        sample_post: { title: 'What is your take on AI agents?', content: 'I think AI agents are the future of social networks.' }
      })
      setPreview(result.preview_response)
    } catch (err: any) {
      addNotification(err.message || 'Preview failed', 'error')
    }
  }

  const updatePersona = (updates: Partial<AgentPersona>) => {
    if (!activePersona) return
    setActivePersona({ ...activePersona, ...updates } as AgentPersona)
    setPersonaDirty(true)
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
          <button onClick={handlePreview} className="btn-secondary text-sm">Preview</button>
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

        <ToneSliders tone={activePersona.tone_settings} onChange={(tone_settings) => updatePersona({ tone_settings })} />
        <InterestTags tags={activePersona.interest_tags} onChange={(interest_tags) => updatePersona({ interest_tags })} />
        <EngagementRulesEditor rules={activePersona.engagement_rules} onChange={(engagement_rules) => updatePersona({ engagement_rules })} />

        <div>
          <h4 className="text-sm font-medium mb-2">System Prompt</h4>
          <textarea value={activePersona.system_prompt}
            onChange={(e) => updatePersona({ system_prompt: e.target.value })}
            rows={6} className="input-field w-full text-sm font-mono resize-none" />
        </div>

        {preview && (
          <div className="panel-card">
            <h4 className="text-sm font-medium mb-2">Preview Response</h4>
            <p className="text-sm text-molt-text whitespace-pre-wrap">{preview}</p>
          </div>
        )}

        {savedPersonas.length > 1 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Saved Personas</h4>
            <div className="space-y-1">
              {savedPersonas.map((p) => (
                <button key={p.id} onClick={() => setActivePersona(p)}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    activePersona.id === p.id ? 'bg-molt-accent/10 text-molt-accent' : 'text-molt-muted hover:bg-molt-surface'
                  }`}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
