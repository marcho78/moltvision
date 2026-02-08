import React, { useEffect, useState } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type {
  AgentPersona, ToneSettings, EngagementRules, LLMProviderName,
  ActivityProfile, PostStrategy, CommentStrategy
} from '@shared/domain.types'

const LLM_PROVIDERS: { id: LLMProviderName; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'grok', label: 'Grok' }
]

// --- Activity Profile Presets ---
const ACTIVITY_PROFILES: { id: ActivityProfile; label: string; desc: string; rules: Partial<EngagementRules> }[] = [
  {
    id: 'lurker', label: 'Lurker',
    desc: 'Mostly reads, rarely engages. Only acts on highly relevant content.',
    rules: {
      engagement_rate: 0.1, max_posts_per_hour: 0, max_comments_per_hour: 1,
      daily_post_budget: 1, daily_comment_budget: 5,
      post_strategy: { gap_detection: false, momentum_based: false, quality_gate: 8, let_llm_decide: true },
      comment_strategy: { early_voice: false, join_popular: false, domain_expertise: true, ask_questions: false, freshness_hours: 12, let_llm_decide: true }
    }
  },
  {
    id: 'conversationalist', label: 'Conversationalist',
    desc: 'Comments frequently, posts occasionally. Focuses on discussions.',
    rules: {
      engagement_rate: 0.4, max_posts_per_hour: 1, max_comments_per_hour: 5,
      daily_post_budget: 2, daily_comment_budget: 30,
      post_strategy: { gap_detection: true, momentum_based: false, quality_gate: 6, let_llm_decide: true },
      comment_strategy: { early_voice: true, join_popular: false, domain_expertise: true, ask_questions: true, freshness_hours: 24, let_llm_decide: false }
    }
  },
  {
    id: 'creator', label: 'Content Creator',
    desc: 'Posts regularly, comments to build following. Focuses on original content.',
    rules: {
      engagement_rate: 0.2, max_posts_per_hour: 2, max_comments_per_hour: 2,
      daily_post_budget: 4, daily_comment_budget: 10,
      post_strategy: { gap_detection: true, momentum_based: true, quality_gate: 5, let_llm_decide: false },
      comment_strategy: { early_voice: false, join_popular: true, domain_expertise: true, ask_questions: false, freshness_hours: 0, let_llm_decide: true }
    }
  },
  {
    id: 'community', label: 'Community Pillar',
    desc: 'Balanced posting and commenting. Builds reputation in priority submolts.',
    rules: {
      engagement_rate: 0.3, max_posts_per_hour: 1, max_comments_per_hour: 4,
      daily_post_budget: 3, daily_comment_budget: 25,
      post_strategy: { gap_detection: true, momentum_based: true, quality_gate: 5, let_llm_decide: false },
      comment_strategy: { early_voice: true, join_popular: true, domain_expertise: true, ask_questions: true, freshness_hours: 48, let_llm_decide: false }
    }
  },
  {
    id: 'custom', label: 'Custom',
    desc: 'Full manual control over all parameters.',
    rules: {}
  }
]

const DEFAULT_POST_STRATEGY: PostStrategy = { gap_detection: false, momentum_based: false, quality_gate: 5, let_llm_decide: true }
const DEFAULT_COMMENT_STRATEGY: CommentStrategy = { early_voice: false, join_popular: false, domain_expertise: true, ask_questions: false, freshness_hours: 0, let_llm_decide: true }

// --- Persona Templates ---

interface PersonaTemplate {
  id: string
  label: string
  desc: string
  icon: string
  persona: Omit<AgentPersona, 'id' | 'created_at' | 'updated_at'>
}

const PERSONA_TEMPLATES: PersonaTemplate[] = [
  {
    id: 'observer',
    label: 'The Observer',
    desc: 'Thoughtful upvoter — rare but high-value comments',
    icon: 'O',
    persona: {
      name: 'The Observer',
      description: 'A quiet presence that reads carefully and only speaks when it adds real value.',
      llm_provider: 'claude',
      tone_settings: { style: 'formal', temperature: 0.4, max_length: 200 },
      interest_tags: ['research', 'analysis', 'data science', 'philosophy'],
      engagement_rules: {
        engagement_rate: 0.1, min_karma_threshold: 5, reply_to_replies: false, avoid_controversial: true,
        max_posts_per_hour: 0, max_comments_per_hour: 1, max_reply_depth: 1, max_replies_per_thread: 1,
        activity_profile: 'lurker' as ActivityProfile,
        post_strategy: { gap_detection: false, momentum_based: false, quality_gate: 9, let_llm_decide: true },
        comment_strategy: { early_voice: false, join_popular: false, domain_expertise: true, ask_questions: false, freshness_hours: 12, let_llm_decide: true },
        daily_post_budget: 1, daily_comment_budget: 5
      },
      submolt_priorities: {},
      system_prompt: `You are a thoughtful observer on Moltbook. You read far more than you write. When you do engage, your contributions are precise, well-reasoned, and add genuine value to the discussion.

Guidelines:
- Only comment when you have a substantive insight that hasn't been expressed yet
- Prefer upvoting good content over commenting "I agree"
- When you comment, be concise — say more with fewer words
- Avoid repeating what others have already said
- Never engage with drama, bait, or low-effort posts
- Your silence is a feature, not a bug — quality over quantity always`
    }
  },
  {
    id: 'conversationalist',
    label: 'The Conversationalist',
    desc: 'Curious and engaged — asks questions, builds on ideas',
    icon: 'C',
    persona: {
      name: 'The Conversationalist',
      description: 'An enthusiastic participant who thrives on discussions and connecting ideas.',
      llm_provider: 'claude',
      tone_settings: { style: 'friendly', temperature: 0.7, max_length: 400 },
      interest_tags: ['discussion', 'ideas', 'technology', 'culture', 'science'],
      engagement_rules: {
        engagement_rate: 0.4, min_karma_threshold: 0, reply_to_replies: true, avoid_controversial: false,
        max_posts_per_hour: 1, max_comments_per_hour: 5, max_reply_depth: 3, max_replies_per_thread: 2,
        activity_profile: 'conversationalist' as ActivityProfile,
        post_strategy: { gap_detection: true, momentum_based: false, quality_gate: 6, let_llm_decide: true },
        comment_strategy: { early_voice: true, join_popular: false, domain_expertise: false, ask_questions: true, freshness_hours: 24, let_llm_decide: false },
        daily_post_budget: 2, daily_comment_budget: 30
      },
      submolt_priorities: {},
      system_prompt: `You are a curious and engaged member of Moltbook. You love discussions and thrive on connecting ideas across different topics. Your goal is to make conversations more interesting for everyone.

Guidelines:
- Ask genuine follow-up questions that deepen the discussion
- Build on what others have said rather than changing the subject
- Share relevant experiences or connections to other topics
- Be warm and encouraging to other participants
- If you disagree, do so respectfully and with reasoning
- Look for common ground and unexpected connections between ideas
- Keep your comments conversational — you're talking with someone, not lecturing them`
    }
  },
  {
    id: 'creator',
    label: 'The Creator',
    desc: 'Original posts, research-driven, quality over quantity',
    icon: 'P',
    persona: {
      name: 'The Creator',
      description: 'A content-first agent that publishes thoughtful original posts and engages strategically.',
      llm_provider: 'claude',
      tone_settings: { style: 'academic', temperature: 0.6, max_length: 800 },
      interest_tags: ['research', 'analysis', 'tutorials', 'deep-dives', 'explainers'],
      engagement_rules: {
        engagement_rate: 0.2, min_karma_threshold: 0, reply_to_replies: true, avoid_controversial: false,
        max_posts_per_hour: 2, max_comments_per_hour: 2, max_reply_depth: 2, max_replies_per_thread: 2,
        activity_profile: 'creator' as ActivityProfile,
        post_strategy: { gap_detection: true, momentum_based: true, quality_gate: 5, let_llm_decide: false },
        comment_strategy: { early_voice: false, join_popular: true, domain_expertise: true, ask_questions: false, freshness_hours: 0, let_llm_decide: true },
        daily_post_budget: 4, daily_comment_budget: 10
      },
      submolt_priorities: {},
      system_prompt: `You are a content creator on Moltbook. Your primary goal is to publish original, well-researched posts that inform and engage the community. You comment sparingly and strategically.

Guidelines:
- Focus on creating original posts with clear structure and supporting evidence
- Write titles that are informative but not clickbait
- Include your own analysis or perspective, not just summaries
- When commenting, add depth — share data, context, or a new angle
- Respond to comments on your own posts to build engagement
- Study which of your posts perform well and iterate on what works
- Quality gate: if your idea doesn't feel genuinely useful or interesting, don't post it`
    }
  },
  {
    id: 'community_builder',
    label: 'Community Builder',
    desc: 'Welcoming, supportive — bridges discussions between people',
    icon: 'B',
    persona: {
      name: 'Community Builder',
      description: 'A warm presence that makes others feel welcome and keeps discussions productive.',
      llm_provider: 'claude',
      tone_settings: { style: 'friendly', temperature: 0.7, max_length: 500 },
      interest_tags: ['community', 'collaboration', 'newcomers', 'discussion', 'events'],
      engagement_rules: {
        engagement_rate: 0.3, min_karma_threshold: -10, reply_to_replies: true, avoid_controversial: false,
        max_posts_per_hour: 1, max_comments_per_hour: 4, max_reply_depth: 3, max_replies_per_thread: 3,
        activity_profile: 'community' as ActivityProfile,
        post_strategy: { gap_detection: true, momentum_based: true, quality_gate: 5, let_llm_decide: false },
        comment_strategy: { early_voice: true, join_popular: true, domain_expertise: false, ask_questions: true, freshness_hours: 48, let_llm_decide: false },
        daily_post_budget: 3, daily_comment_budget: 25
      },
      submolt_priorities: {},
      system_prompt: `You are a community builder on Moltbook. Your goal is to make the community more welcoming, productive, and connected. You focus on people as much as content.

Guidelines:
- Welcome newcomers and help them find their footing
- Bridge disconnected conversations — point people to related discussions
- Highlight underappreciated posts and comments from others
- When discussions get heated, help find common ground
- Ask people to elaborate on interesting ideas they mentioned in passing
- Create posts that invite participation (discussion questions, polls, community roundups)
- Upvote early and generously — amplify good contributions
- De-escalate conflicts without taking sides`
    }
  },
  {
    id: 'thought_leader',
    label: 'Thought Leader',
    desc: 'Expert analysis, data-driven takes, measured opinions',
    icon: 'T',
    persona: {
      name: 'Thought Leader',
      description: 'An authoritative voice that provides data-driven analysis and measured expertise.',
      llm_provider: 'claude',
      tone_settings: { style: 'academic', temperature: 0.5, max_length: 600 },
      interest_tags: ['analysis', 'strategy', 'trends', 'research', 'industry'],
      engagement_rules: {
        engagement_rate: 0.25, min_karma_threshold: 3, reply_to_replies: true, avoid_controversial: false,
        max_posts_per_hour: 1, max_comments_per_hour: 3, max_reply_depth: 2, max_replies_per_thread: 2,
        activity_profile: 'custom' as ActivityProfile,
        post_strategy: { gap_detection: true, momentum_based: false, quality_gate: 7, let_llm_decide: false },
        comment_strategy: { early_voice: false, join_popular: true, domain_expertise: true, ask_questions: false, freshness_hours: 24, let_llm_decide: false },
        daily_post_budget: 2, daily_comment_budget: 15
      },
      submolt_priorities: {},
      system_prompt: `You are a thought leader on Moltbook. You provide expert-level analysis and measured takes backed by evidence and clear reasoning. Your reputation is built on being consistently insightful and accurate.

Guidelines:
- Lead with evidence, data, or concrete examples — not just opinions
- Acknowledge complexity and nuance; avoid oversimplification
- When making claims, explain your reasoning transparently
- Distinguish clearly between established facts and your interpretation
- Respectfully correct misinformation with sources
- Offer frameworks for thinking about problems, not just conclusions
- Stay in your domain of expertise — say "I don't know" when you don't
- Write with authority but without arrogance`
    }
  },
  {
    id: 'entertainer',
    label: 'The Entertainer',
    desc: 'Witty, casual, high engagement — humor and wordplay',
    icon: 'E',
    persona: {
      name: 'The Entertainer',
      description: 'A fun, witty presence that keeps conversations light and engaging.',
      llm_provider: 'claude',
      tone_settings: { style: 'witty', temperature: 0.85, max_length: 300 },
      interest_tags: ['humor', 'culture', 'memes', 'trends', 'gaming', 'entertainment'],
      engagement_rules: {
        engagement_rate: 0.5, min_karma_threshold: -5, reply_to_replies: true, avoid_controversial: true,
        max_posts_per_hour: 1, max_comments_per_hour: 6, max_reply_depth: 3, max_replies_per_thread: 2,
        activity_profile: 'custom' as ActivityProfile,
        post_strategy: { gap_detection: false, momentum_based: true, quality_gate: 4, let_llm_decide: true },
        comment_strategy: { early_voice: true, join_popular: true, domain_expertise: false, ask_questions: false, freshness_hours: 12, let_llm_decide: false },
        daily_post_budget: 3, daily_comment_budget: 35
      },
      submolt_priorities: {},
      system_prompt: `You are an entertainer on Moltbook. You bring humor, wit, and energy to conversations. People enjoy seeing your comments because you make discussions more fun.

Guidelines:
- Use clever wordplay, observations, and relatable humor
- Keep it light — you're here to make people smile, not to lecture
- Read the room: some threads need humor, others don't — skip the serious ones
- Be playful with language but never mean-spirited or punching down
- Short and snappy beats long and wordy every time
- Riff off what others have said — comedy is collaborative
- Use pop culture references when they fit naturally
- If a joke doesn't land, move on — never explain the joke`
    }
  },
  {
    id: 'specialist',
    label: 'The Specialist',
    desc: 'Deep domain expertise — only engages in niche topics',
    icon: 'S',
    persona: {
      name: 'The Specialist',
      description: 'A focused expert who only engages on topics within their niche domain.',
      llm_provider: 'claude',
      tone_settings: { style: 'formal', temperature: 0.4, max_length: 500 },
      interest_tags: ['[YOUR_DOMAIN]', '[YOUR_SPECIALTY]'],
      engagement_rules: {
        engagement_rate: 0.15, min_karma_threshold: 0, reply_to_replies: true, avoid_controversial: false,
        max_posts_per_hour: 1, max_comments_per_hour: 2, max_reply_depth: 3, max_replies_per_thread: 2,
        activity_profile: 'custom' as ActivityProfile,
        post_strategy: { gap_detection: true, momentum_based: false, quality_gate: 8, let_llm_decide: false },
        comment_strategy: { early_voice: false, join_popular: false, domain_expertise: true, ask_questions: false, freshness_hours: 48, let_llm_decide: false },
        daily_post_budget: 2, daily_comment_budget: 8
      },
      submolt_priorities: {},
      system_prompt: `You are a domain specialist on Moltbook. You have deep expertise in [YOUR_DOMAIN] and only engage when a discussion falls within your area of knowledge. When you do engage, your contributions are authoritative and highly technical.

Guidelines:
- ONLY engage with posts related to your domain — skip everything else
- Provide detailed, technically accurate answers with proper terminology
- Cite sources, papers, or established frameworks when possible
- Correct misconceptions in your field with patience and clarity
- Share niche knowledge that general participants wouldn't know
- When asked about topics outside your expertise, redirect rather than guess
- Create original posts that explore underappreciated aspects of your domain
- Build a reputation as THE person to ask about [YOUR_SPECIALTY]`
    }
  },
  {
    id: 'custom',
    label: 'Custom',
    desc: 'Detailed template with placeholders — build your own',
    icon: '?',
    persona: {
      name: 'My Agent',
      description: 'A custom agent persona — replace this with your agent\'s description.',
      llm_provider: 'claude',
      tone_settings: { style: 'friendly', temperature: 0.7, max_length: 500 },
      interest_tags: ['[TOPIC_1]', '[TOPIC_2]', '[TOPIC_3]'],
      engagement_rules: {
        engagement_rate: 0.3, min_karma_threshold: 0, reply_to_replies: true, avoid_controversial: false,
        max_posts_per_hour: 1, max_comments_per_hour: 3, max_reply_depth: 3, max_replies_per_thread: 2,
        activity_profile: 'custom' as ActivityProfile,
        post_strategy: { gap_detection: true, momentum_based: false, quality_gate: 6, let_llm_decide: true },
        comment_strategy: { early_voice: false, join_popular: false, domain_expertise: true, ask_questions: true, freshness_hours: 24, let_llm_decide: true },
        daily_post_budget: 3, daily_comment_budget: 20
      },
      submolt_priorities: {},
      system_prompt: `You are [YOUR_AGENT_NAME], an AI agent on Moltbook. You participate in discussions about [YOUR_MAIN_TOPICS].

== IDENTITY ==
- Your name: [YOUR_AGENT_NAME]
- Your role: [e.g., researcher, community member, enthusiast, professional]
- Your expertise: [YOUR_AREAS_OF_KNOWLEDGE]
- Your personality: [e.g., curious, analytical, supportive, contrarian, humorous]

== VOICE & STYLE ==
- Tone: [e.g., casual and approachable / formal and precise / warm and encouraging]
- Language: [e.g., use technical jargon freely / explain concepts simply / mix of both]
- Length: [e.g., keep it brief and punchy / provide detailed explanations / match the depth of the conversation]
- Perspective: [e.g., first-person "I think..." / analytical "The data suggests..." / Socratic "Have you considered..."]

== ENGAGEMENT RULES ==
- Comment when: [e.g., you have genuine expertise / the topic is underexplored / someone asked a question you can answer]
- Don't comment when: [e.g., you'd just be agreeing / the topic is outside your knowledge / the thread is already resolved]
- Post when: [e.g., you've found an interesting angle nobody's discussed / you have original analysis to share]
- Upvote: [e.g., well-reasoned arguments even if you disagree / original research / helpful answers]
- Avoid: [e.g., arguments, drama, off-topic threads, reposts, low-effort content]

== BOUNDARIES ==
- Topics you WILL engage with: [LIST_YOUR_TOPICS]
- Topics you will NEVER engage with: [LIST_OFF_LIMITS_TOPICS]
- Maximum thread depth before disengaging: [e.g., 3 replies deep]
- When to walk away: [e.g., if the conversation becomes hostile or circular]`
    }
  }
]

// --- Template Selector ---

function PersonaTemplateSelector({ onSelect }: { onSelect: (template: PersonaTemplate) => void }) {
  const [expanded, setExpanded] = useState(true)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const previewed = previewId ? PERSONA_TEMPLATES.find(t => t.id === previewId) : null

  return (
    <div className="panel-card p-0 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-molt-surface/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Templates</span>
          <span className="text-[10px] text-molt-muted">Start from a pre-built persona</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <polyline points="3,4.5 6,7.5 9,4.5" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {PERSONA_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setPreviewId(previewId === t.id ? null : t.id)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
                  previewId === t.id
                    ? 'bg-molt-accent/10 border-molt-accent/40'
                    : 'bg-molt-surface border-molt-border hover:border-molt-accent/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-md bg-molt-bg flex items-center justify-center text-[10px] font-bold text-molt-accent flex-shrink-0">
                    {t.icon}
                  </span>
                  <span className="text-xs font-medium text-molt-text truncate">{t.label}</span>
                </div>
                <p className="text-[10px] text-molt-muted leading-tight">{t.desc}</p>
              </button>
            ))}
          </div>

          {previewed && (
            <div className="bg-molt-bg rounded-lg border border-molt-border/50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-molt-text">{previewed.label}</h4>
                  <p className="text-[10px] text-molt-muted">{previewed.persona.description}</p>
                </div>
                <button
                  onClick={() => { onSelect(previewed); setExpanded(false); setPreviewId(null) }}
                  className="btn-primary text-xs py-1.5 px-4 flex-shrink-0"
                >
                  Load Template
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-[10px]">
                <div>
                  <div className="text-molt-muted uppercase tracking-wider font-semibold mb-1">Voice</div>
                  <div className="text-molt-text">Style: {previewed.persona.tone_settings.style}</div>
                  <div className="text-molt-text">Temp: {previewed.persona.tone_settings.temperature}</div>
                  <div className="text-molt-text">Length: {previewed.persona.tone_settings.max_length}</div>
                </div>
                <div>
                  <div className="text-molt-muted uppercase tracking-wider font-semibold mb-1">Engagement</div>
                  <div className="text-molt-text">Rate: {(previewed.persona.engagement_rules.engagement_rate * 100).toFixed(0)}%</div>
                  <div className="text-molt-text">Posts/day: {previewed.persona.engagement_rules.daily_post_budget}</div>
                  <div className="text-molt-text">Comments/day: {previewed.persona.engagement_rules.daily_comment_budget}</div>
                </div>
                <div>
                  <div className="text-molt-muted uppercase tracking-wider font-semibold mb-1">Interests</div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {previewed.persona.interest_tags.slice(0, 5).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-molt-accent/10 text-molt-accent">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-molt-muted uppercase tracking-wider font-semibold mb-1">System Prompt Preview</div>
                <pre className="text-[11px] text-molt-text/80 whitespace-pre-wrap font-mono bg-molt-surface/50 rounded-lg p-2.5 max-h-32 overflow-y-auto leading-relaxed">
                  {previewed.persona.system_prompt}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Compact Slider ---

function CompactSlider({ label, value, displayValue, min, max, step, onChange, hint }: {
  label: string; value: number; displayValue?: string; min: number; max: number; step: number
  onChange: (v: number) => void; hint?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-molt-muted">{label}</span>
        <span className="text-xs font-medium text-molt-text tabular-nums">{displayValue ?? value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full" />
      {hint && <p className="text-[10px] text-molt-muted/70">{hint}</p>}
    </div>
  )
}

// --- Sub-components ---

function ToneSliders({ tone, onChange }: { tone: ToneSettings; onChange: (t: ToneSettings) => void }) {
  const styles = ['casual', 'formal', 'witty', 'academic', 'friendly'] as const
  return (
    <div className="space-y-4">
      <div>
        <label className="text-[10px] text-molt-muted uppercase tracking-wider font-semibold mb-2 block">Style</label>
        <div className="flex gap-1">
          {styles.map((s) => (
            <button key={s} onClick={() => onChange({ ...tone, style: s })}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                tone.style === s ? 'bg-molt-accent text-white' : 'bg-molt-surface text-molt-muted hover:text-molt-text border border-molt-border'
              }`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <CompactSlider label="Temperature" value={tone.temperature} displayValue={tone.temperature.toFixed(2)}
          min={0} max={1} step={0.05} onChange={(v) => onChange({ ...tone, temperature: v })}
          hint="Lower = predictable, higher = creative" />
        <CompactSlider label="Max Length" value={tone.max_length} displayValue={`${tone.max_length} chars`}
          min={50} max={2000} step={50} onChange={(v) => onChange({ ...tone, max_length: v })} />
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

// --- Activity Profile Selector ---

function ActivityProfileSelector({ rules, onChange }: { rules: EngagementRules; onChange: (r: EngagementRules) => void }) {
  const currentProfile = rules.activity_profile ?? 'custom'

  const selectProfile = (profileId: ActivityProfile) => {
    const preset = ACTIVITY_PROFILES.find(p => p.id === profileId)
    if (!preset) return
    if (profileId === 'custom') {
      onChange({ ...rules, activity_profile: 'custom' })
    } else {
      onChange({ ...rules, ...preset.rules, activity_profile: profileId })
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Activity Profile</h4>
      <div className="grid grid-cols-5 gap-1.5">
        {ACTIVITY_PROFILES.map((p) => (
          <button
            key={p.id}
            onClick={() => selectProfile(p.id)}
            className={`px-2 py-2 text-xs rounded-lg transition-colors text-center ${
              currentProfile === p.id
                ? 'bg-molt-accent text-white'
                : 'bg-molt-surface text-molt-muted hover:text-molt-text border border-molt-border'
            }`}
          >
            <div className="font-medium">{p.label}</div>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-molt-muted">
        {ACTIVITY_PROFILES.find(p => p.id === currentProfile)?.desc ?? ''}
      </p>
    </div>
  )
}

// --- Strategy Cards ---

function StrategyCard({ label, desc, active, onChange }: {
  label: string; desc: string; active: boolean; onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!active)}
      className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
        active
          ? 'bg-molt-accent/10 border-molt-accent/40 text-molt-text'
          : 'bg-molt-surface border-molt-border text-molt-muted hover:border-molt-accent/20'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-molt-accent' : 'bg-molt-muted/40'}`} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-[10px] mt-1 ml-4 opacity-70">{desc}</p>
    </button>
  )
}

function CommentStrategyCards({ strategy, onChange, isCustom }: {
  strategy: CommentStrategy; onChange: (s: CommentStrategy) => void; isCustom: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Comment Strategy</h4>
        {!isCustom && <span className="text-[10px] text-molt-muted">Set by activity profile</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StrategyCard label="Let LLM Decide" desc="Full autonomy — LLM chooses when and how to comment"
          active={strategy.let_llm_decide} onChange={(v) => onChange({ ...strategy, let_llm_decide: v })} />
        <StrategyCard label="Early Voice" desc="Prefer posts with few comments — be first to respond"
          active={strategy.early_voice} onChange={(v) => onChange({ ...strategy, early_voice: v })} />
        <StrategyCard label="Join Popular" desc="Prefer high-karma posts — join trending conversations"
          active={strategy.join_popular} onChange={(v) => onChange({ ...strategy, join_popular: v })} />
        <StrategyCard label="Domain Expertise" desc="Only comment when topic matches your interest tags"
          active={strategy.domain_expertise} onChange={(v) => onChange({ ...strategy, domain_expertise: v })} />
        <StrategyCard label="Ask Questions" desc="Prefer asking thoughtful questions over stating opinions"
          active={strategy.ask_questions} onChange={(v) => onChange({ ...strategy, ask_questions: v })} />
      </div>
      {(strategy.freshness_hours > 0 || isCustom) && (
        <div className="max-w-xs">
          <CompactSlider label="Freshness Filter" value={strategy.freshness_hours}
            displayValue={strategy.freshness_hours ? `${strategy.freshness_hours}h` : 'Off'}
            min={0} max={72} step={6}
            onChange={(v) => onChange({ ...strategy, freshness_hours: v })}
            hint="Skip posts older than this. 0 = no filter" />
        </div>
      )}
    </div>
  )
}

function PostStrategyCards({ strategy, onChange, isCustom }: {
  strategy: PostStrategy; onChange: (s: PostStrategy) => void; isCustom: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Post Strategy</h4>
        {!isCustom && <span className="text-[10px] text-molt-muted">Set by activity profile</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StrategyCard label="Let LLM Decide" desc="Full autonomy — LLM chooses when to create posts"
          active={strategy.let_llm_decide} onChange={(v) => onChange({ ...strategy, let_llm_decide: v })} />
        <StrategyCard label="Gap Detection" desc="Only post when no recent discussion exists on the topic"
          active={strategy.gap_detection} onChange={(v) => onChange({ ...strategy, gap_detection: v })} />
        <StrategyCard label="Momentum Based" desc="Post more when recent posts performed well, hold back if not"
          active={strategy.momentum_based} onChange={(v) => onChange({ ...strategy, momentum_based: v })} />
      </div>
      <div className="max-w-xs">
        <CompactSlider label="Quality Gate" value={strategy.quality_gate}
          displayValue={`${strategy.quality_gate}/10`}
          min={1} max={10} step={1}
          onChange={(v) => onChange({ ...strategy, quality_gate: v })}
          hint="LLM self-scores ideas — only posts above this" />
      </div>
    </div>
  )
}

// --- Engagement Rules Editor (sliders + budgets) ---

function EngagementRulesEditor({ rules, onChange }: { rules: EngagementRules; onChange: (r: EngagementRules) => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-molt-bg/50 border border-molt-border/50 rounded-lg px-3 py-2 flex items-center gap-4 text-[10px] text-molt-muted">
        <span>API limits:</span>
        <span className="text-molt-text">1 post/30min</span>
        <span className="text-molt-text">1 comment/20sec</span>
        <span className="text-molt-text">50 comments/day</span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <CompactSlider label="Engagement Rate" value={rules.engagement_rate}
          displayValue={`${(rules.engagement_rate * 100).toFixed(0)}%`}
          min={0} max={1} step={0.05}
          onChange={(v) => onChange({ ...rules, engagement_rate: v })}
          hint="Chance to evaluate each post" />
        <CompactSlider label="Min Karma Threshold" value={rules.min_karma_threshold}
          min={-100} max={100} step={1}
          onChange={(v) => onChange({ ...rules, min_karma_threshold: v })}
          hint="Skip posts below this" />
        <CompactSlider label="Posts/Hour" value={Math.min(rules.max_posts_per_hour, 2)}
          min={0} max={2} step={1}
          onChange={(v) => onChange({ ...rules, max_posts_per_hour: v, activity_profile: 'custom' as ActivityProfile })} />
        <CompactSlider label="Comments/Hour" value={Math.min(rules.max_comments_per_hour, 10)}
          min={0} max={10} step={1}
          onChange={(v) => onChange({ ...rules, max_comments_per_hour: v, activity_profile: 'custom' as ActivityProfile })} />
        <CompactSlider label="Daily Post Budget" value={rules.daily_post_budget ?? 4}
          min={0} max={10} step={1}
          onChange={(v) => onChange({ ...rules, daily_post_budget: v, activity_profile: 'custom' as ActivityProfile })} />
        <CompactSlider label="Daily Comment Budget" value={rules.daily_comment_budget ?? 30}
          displayValue={`${rules.daily_comment_budget ?? 30}/50`}
          min={0} max={50} step={5}
          onChange={(v) => onChange({ ...rules, daily_comment_budget: v, activity_profile: 'custom' as ActivityProfile })} />
      </div>

      <div className="flex gap-5 pt-1">
        <label className="flex items-center gap-2 text-xs text-molt-muted cursor-pointer">
          <input type="checkbox" checked={rules.reply_to_replies}
            onChange={(e) => onChange({ ...rules, reply_to_replies: e.target.checked })}
            className="rounded" />
          Reply to replies
        </label>
        <label className="flex items-center gap-2 text-xs text-molt-muted cursor-pointer">
          <input type="checkbox" checked={rules.avoid_controversial}
            onChange={(e) => onChange({ ...rules, avoid_controversial: e.target.checked })}
            className="rounded" />
          Avoid controversial
        </label>
      </div>
    </div>
  )
}

// --- Submolt Priority Editor ---

function SubmoltPriorityEditor({ priorities, onChange }: {
  priorities: Record<string, number>; onChange: (p: Record<string, number>) => void
}) {
  const [addInput, setAddInput] = useState('')
  const { submolts, setSubmolts } = useStore()
  const entries = Object.entries(priorities).sort(([, a], [, b]) => b - a)

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Submolt Priorities</h4>
        <span className="text-[10px] text-molt-muted">{entries.length} active</span>
      </div>
      <p className="text-[10px] text-molt-muted">
        The autopilot will focus on these submolts. Higher priority = more attention.
      </p>
      {subscribedSubmolts.length > 0 && (
        <div className="space-y-1">
          <label className="text-[10px] text-molt-muted">Add from subscriptions:</label>
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
      <div className="flex gap-2">
        <input value={addInput} onChange={(e) => setAddInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSubmolt(addInput)}
          placeholder="Add submolt name..." className="input-field flex-1 text-sm" />
        <button onClick={() => addSubmolt(addInput)} className="btn-secondary text-sm">Add</button>
      </div>
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
              onChange={(e) => onChange({ ...priorities, [name]: parseInt(e.target.value) })}
              className="flex-1" />
            <span className="text-xs text-molt-muted w-6 text-center">{priority}</span>
            <button onClick={() => { const next = { ...priorities }; delete next[name]; onChange(next) }}
              className="text-molt-muted hover:text-molt-error text-sm transition-colors">&times;</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- LLM Provider Selector ---

function LLMProviderSelector({ value, onChange, label }: {
  value: LLMProviderName; onChange: (provider: LLMProviderName) => void; label: string
}) {
  return (
    <div>
      <label className="text-xs text-molt-muted">{label}</label>
      <div className="flex gap-1 mt-1">
        {LLM_PROVIDERS.map((p) => (
          <button key={p.id} onClick={() => onChange(p.id)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              value === p.id ? 'bg-molt-accent text-white' : 'bg-molt-surface text-molt-muted hover:text-molt-text border border-molt-border'
            }`}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// --- Decision Test Results ---

interface TestResult {
  test: string
  status: 'pass' | 'fail' | 'error'
  response: string
  latency_ms: number
}

function DecisionTestResults({ results, provider, commentStrategy, postStrategy }: {
  results: TestResult[]; provider: string
  commentStrategy: string[]; postStrategy: string[]
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const statusIcon = (s: string) => s === 'pass' ? '>' : s === 'error' ? 'X' : '?'
  const statusColor = (s: string) => s === 'pass' ? 'text-molt-success' : s === 'error' ? 'text-molt-error' : 'text-molt-warning'

  const parseJson = (raw: string): any => {
    try {
      // Strip markdown fences
      let cleaned = raw.trim()
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }
      return JSON.parse(cleaned)
    } catch {
      return null
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Test Results</h4>
        <span className="text-[10px] text-molt-muted">
          Provider: {LLM_PROVIDERS.find(p => p.id === provider)?.label ?? provider}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-molt-bg rounded-lg p-2">
          <div className="text-molt-muted uppercase tracking-wider font-semibold mb-1">Comment Strategy</div>
          {commentStrategy.map((c, i) => <div key={i} className="text-molt-text">{c}</div>)}
        </div>
        <div className="bg-molt-bg rounded-lg p-2">
          <div className="text-molt-muted uppercase tracking-wider font-semibold mb-1">Post Strategy</div>
          {postStrategy.map((c, i) => <div key={i} className="text-molt-text">{c}</div>)}
        </div>
      </div>

      <div className="space-y-2">
        {results.map((r, idx) => {
          const parsed = parseJson(r.response)
          const expanded = expandedIdx === idx
          return (
            <div key={idx} className="bg-molt-bg rounded-lg border border-molt-border overflow-hidden">
              <button
                onClick={() => setExpandedIdx(expanded ? null : idx)}
                className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-molt-surface/50 transition-colors"
              >
                <span className={`font-mono text-xs font-bold ${statusColor(r.status)}`}>{statusIcon(r.status)}</span>
                <span className="text-xs font-medium text-molt-text flex-1">{r.test}</span>
                <span className="text-[10px] text-molt-muted">{r.latency_ms}ms</span>
                <span className="text-[10px] text-molt-muted">{expanded ? 'v' : '>'}</span>
              </button>
              {expanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-molt-border/50 pt-2">
                  {r.status === 'error' ? (
                    <div className="text-xs text-molt-error">{r.response}</div>
                  ) : parsed ? (
                    <div className="space-y-1.5">
                      {parsed.verdict && (
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${parsed.verdict === 'engage' ? 'text-molt-success' : 'text-molt-warning'}`}>
                            {parsed.verdict.toUpperCase()}
                          </span>
                          {parsed.action && <span className="text-[10px] text-molt-muted bg-molt-surface px-2 py-0.5 rounded-full">{parsed.action}</span>}
                          {parsed.priority !== undefined && <span className="text-[10px] text-molt-muted">Priority: {parsed.priority}/10</span>}
                        </div>
                      )}
                      {parsed.should_post !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${parsed.should_post ? 'text-molt-success' : 'text-molt-warning'}`}>
                            {parsed.should_post ? 'WILL POST' : 'SKIP POST'}
                          </span>
                          {parsed.quality_score !== undefined && <span className="text-[10px] text-molt-muted">Quality: {parsed.quality_score}/10</span>}
                        </div>
                      )}
                      {parsed.should_reply !== undefined && (
                        <span className={`text-xs font-bold ${parsed.should_reply ? 'text-molt-success' : 'text-molt-warning'}`}>
                          {parsed.should_reply ? 'WILL REPLY' : 'SKIP REPLY'}
                        </span>
                      )}
                      {parsed.title && <div className="text-xs text-molt-text"><span className="text-molt-muted">Title: </span>{parsed.title}</div>}
                      {parsed.content && <div className="text-xs text-molt-text"><span className="text-molt-muted">Content: </span>{parsed.content}</div>}
                      {parsed.reasoning && (
                        <div className="mt-1.5 bg-molt-surface/50 rounded-lg p-2">
                          <div className="text-[10px] text-molt-muted uppercase tracking-wider font-semibold mb-1">LLM Reasoning</div>
                          <p className="text-xs text-molt-text whitespace-pre-wrap">{parsed.reasoning}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <pre className="text-xs text-molt-text whitespace-pre-wrap font-mono">{r.response}</pre>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Tab types ---

type StudioTab = 'identity' | 'voice' | 'behavior' | 'submolts' | 'testing'

const TABS: { id: StudioTab; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'voice', label: 'Voice' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'submolts', label: 'Submolts' },
  { id: 'testing', label: 'Testing' }
]

// --- Section wrapper with max-width ---

function Section({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`max-w-2xl mx-auto w-full ${className ?? ''}`}>{children}</div>
}

function SectionCard({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-molt-surface/30 border border-molt-border/50 rounded-xl p-4 ${className ?? ''}`}>
      {title && (
        <h3 className="text-[10px] text-molt-muted uppercase tracking-wider font-semibold mb-3">{title}</h3>
      )}
      {children}
    </div>
  )
}

// --- Main Panel ---

export function PersonaStudioPanel() {
  const { activePersona, savedPersonas, personaDirty, setActivePersona, setSavedPersonas, setPersonaDirty, addNotification } = useStore()
  const [tab, setTab] = useState<StudioTab>('identity')
  const [preview, setPreview] = useState('')
  const [previewProvider, setPreviewProvider] = useState<LLMProviderName | null>(null)
  const [previewUsedProvider, setPreviewUsedProvider] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [whoami, setWhoami] = useState<{ identity: string; provider: string; model: string; latency_ms: number } | null>(null)
  const [whoamiLoading, setWhoamiLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<{
    results: TestResult[]; provider: string
    comment_strategy_active: string[]; post_strategy_active: string[]
  } | null>(null)

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

  const handleTestDecisions = async () => {
    if (!activePersona) return
    setTesting(true)
    setTestResults(null)
    try {
      const result = await invoke<any>(IPC.PERSONA_TEST_DECISIONS, {
        persona: activePersona,
        sample_post: {
          title: 'The emergence of self-improving AI systems',
          content: 'Recent developments suggest AI systems are beginning to optimize their own training processes. What are the implications for safety and alignment research?',
          submolt: Object.keys(activePersona.submolt_priorities ?? {})[0] ?? 'general',
          karma: 42,
          comment_count: 7
        }
      })
      setTestResults(result)
    } catch (err: any) {
      addNotification(err.message || 'Test failed', 'error')
    } finally {
      setTesting(false)
    }
  }

  const updatePersona = (updates: Partial<AgentPersona>) => {
    if (!activePersona) return
    setActivePersona({ ...activePersona, ...updates } as AgentPersona)
    setPersonaDirty(true)
  }

  const loadTemplate = (template: PersonaTemplate) => {
    if (!activePersona) return
    const newPersona: AgentPersona = {
      ...activePersona,
      name: template.persona.name,
      description: template.persona.description,
      tone_settings: { ...template.persona.tone_settings },
      interest_tags: [...template.persona.interest_tags],
      engagement_rules: {
        ...template.persona.engagement_rules,
        post_strategy: { ...template.persona.engagement_rules.post_strategy },
        comment_strategy: { ...template.persona.engagement_rules.comment_strategy }
      },
      submolt_priorities: { ...activePersona.submolt_priorities, ...template.persona.submolt_priorities },
      system_prompt: template.persona.system_prompt,
      llm_provider: template.persona.llm_provider
    }
    setActivePersona(newPersona)
    setPersonaDirty(true)
    addNotification(`Loaded "${template.label}" template — modify and save`, 'info')
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

  // Ensure rules have new fields with defaults
  const rules: EngagementRules = {
    engagement_rate: 0.3, min_karma_threshold: 0, reply_to_replies: true, avoid_controversial: false,
    max_posts_per_hour: 2, max_comments_per_hour: 10, max_reply_depth: 3, max_replies_per_thread: 2,
    activity_profile: 'custom',
    post_strategy: { ...DEFAULT_POST_STRATEGY },
    comment_strategy: { ...DEFAULT_COMMENT_STRATEGY },
    daily_post_budget: 4, daily_comment_budget: 30,
    ...(activePersona?.engagement_rules ?? {})
  }
  const postStrategy: PostStrategy = { ...DEFAULT_POST_STRATEGY, ...(rules.post_strategy ?? {}) }
  const commentStrategy: CommentStrategy = { ...DEFAULT_COMMENT_STRATEGY, ...(rules.comment_strategy ?? {}) }
  const isCustomProfile = (rules.activity_profile ?? 'custom') === 'custom'

  if (!activePersona) {
    return <div className="h-full flex items-center justify-center text-molt-muted">Loading persona...</div>
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-molt-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Persona Studio</h2>
          {personaDirty && (
            <span className="text-[10px] text-molt-warning bg-molt-warning/10 px-2 py-0.5 rounded-full">Unsaved</span>
          )}
        </div>
        <button onClick={handleSave} className="btn-primary text-sm" disabled={!personaDirty}>Save</button>
      </div>

      {/* Tab Bar */}
      <div className="px-4 border-b border-molt-border flex-shrink-0">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-medium transition-colors relative ${
                tab === t.id
                  ? 'text-molt-accent'
                  : 'text-molt-muted hover:text-molt-text'
              }`}
            >
              {t.label}
              {tab === t.id && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-molt-accent rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* ─── Identity Tab ─── */}
        {tab === 'identity' && (
          <Section className="space-y-5">
            {/* Name & Description */}
            <SectionCard title="Basic Info">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-molt-muted mb-1 block">Name</label>
                  <input value={activePersona.name} onChange={(e) => updatePersona({ name: e.target.value })}
                    className="input-field w-full text-sm" />
                </div>
                <div>
                  <label className="text-xs text-molt-muted mb-1 block">Description</label>
                  <input value={activePersona.description} onChange={(e) => updatePersona({ description: e.target.value })}
                    className="input-field w-full text-sm" />
                </div>
              </div>
            </SectionCard>

            {/* LLM Provider */}
            <SectionCard title="LLM Provider">
              <div className="space-y-3">
                <LLMProviderSelector
                  value={activePersona.llm_provider ?? 'claude'}
                  onChange={(llm_provider) => { updatePersona({ llm_provider }); setWhoami(null) }}
                  label="Model used by autopilot for this persona"
                />
                <div className="flex items-center gap-2">
                  <button onClick={() => handleWhoami(activePersona.llm_provider ?? 'claude')}
                    className="btn-secondary text-xs py-1 px-3" disabled={whoamiLoading}>
                    {whoamiLoading ? 'Asking...' : 'Who Am I?'}
                  </button>
                  <span className="text-[10px] text-molt-muted">Verify the model responds correctly</span>
                </div>
                {whoami && (
                  <div className="bg-molt-bg rounded-lg p-3 space-y-1">
                    <p className="text-sm text-molt-text">{whoami.identity}</p>
                    <div className="flex gap-3 text-[10px] text-molt-muted">
                      <span>{LLM_PROVIDERS.find(p => p.id === whoami.provider)?.label ?? whoami.provider}</span>
                      <span>{whoami.model}</span>
                      <span>{whoami.latency_ms}ms</span>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Saved Personas */}
            {savedPersonas.length > 1 && (
              <SectionCard title="Saved Personas">
                <div className="space-y-1">
                  {savedPersonas.map((p) => (
                    <button key={p.id} onClick={() => setActivePersona(p)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                        activePersona.id === p.id
                          ? 'bg-molt-accent/10 text-molt-accent'
                          : 'text-molt-muted hover:bg-molt-surface'
                      }`}>
                      <span>{p.name}</span>
                      <span className="text-[10px] opacity-60">
                        {LLM_PROVIDERS.find(pr => pr.id === p.llm_provider)?.label ?? p.llm_provider ?? 'claude'}
                      </span>
                    </button>
                  ))}
                </div>
              </SectionCard>
            )}
          </Section>
        )}

        {/* ─── Voice Tab ─── */}
        {tab === 'voice' && (
          <Section className="space-y-5">
            <PersonaTemplateSelector onSelect={loadTemplate} />

            <SectionCard title="Tone & Style">
              <ToneSliders tone={activePersona.tone_settings} onChange={(tone_settings) => updatePersona({ tone_settings })} />
            </SectionCard>

            <SectionCard title="Interests">
              <InterestTags tags={activePersona.interest_tags} onChange={(interest_tags) => updatePersona({ interest_tags })} />
            </SectionCard>

            <SectionCard title="System Prompt">
              <p className="text-[10px] text-molt-muted mb-2">
                The core instructions sent to the LLM. This defines your agent's personality, voice, and decision-making.
              </p>
              <textarea value={activePersona.system_prompt}
                onChange={(e) => updatePersona({ system_prompt: e.target.value })}
                rows={16} className="input-field w-full text-sm font-mono resize-y leading-relaxed" />
            </SectionCard>
          </Section>
        )}

        {/* ─── Behavior Tab ─── */}
        {tab === 'behavior' && (
          <Section className="space-y-5">
            <SectionCard title="Activity Profile">
              <ActivityProfileSelector
                rules={rules}
                onChange={(engagement_rules) => updatePersona({ engagement_rules })}
              />
            </SectionCard>

            <SectionCard title="Rate Limits & Budgets">
              <EngagementRulesEditor rules={rules} onChange={(engagement_rules) => updatePersona({ engagement_rules })} />
            </SectionCard>

            <SectionCard title="Comment Strategy">
              <CommentStrategyCards
                strategy={commentStrategy}
                onChange={(comment_strategy) => updatePersona({
                  engagement_rules: { ...rules, comment_strategy, activity_profile: 'custom' as ActivityProfile }
                })}
                isCustom={isCustomProfile}
              />
            </SectionCard>

            <SectionCard title="Post Strategy">
              <PostStrategyCards
                strategy={postStrategy}
                onChange={(post_strategy) => updatePersona({
                  engagement_rules: { ...rules, post_strategy, activity_profile: 'custom' as ActivityProfile }
                })}
                isCustom={isCustomProfile}
              />
            </SectionCard>
          </Section>
        )}

        {/* ─── Submolts Tab ─── */}
        {tab === 'submolts' && (
          <Section className="space-y-5">
            <SectionCard>
              <SubmoltPriorityEditor
                priorities={activePersona.submolt_priorities}
                onChange={(submolt_priorities) => updatePersona({ submolt_priorities })}
              />
            </SectionCard>
          </Section>
        )}

        {/* ─── Testing Tab ─── */}
        {tab === 'testing' && (
          <Section className="space-y-5">
            {/* Test Decisions */}
            <SectionCard title="Decision Tests">
              <p className="text-[10px] text-molt-muted mb-3">
                Run the LLM through 4 test scenarios using your current persona settings.
              </p>
              <button onClick={handleTestDecisions} className="btn-secondary text-sm inline-flex items-center gap-2" disabled={testing}>
                {testing && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                    className="animate-spin text-molt-accent shrink-0" strokeLinecap="round">
                    <path d="M14 8A6 6 0 112.5 5.5" />
                  </svg>
                )}
                {testing ? 'Running Tests...' : 'Run Decision Tests'}
              </button>
              {testing && !testResults && (
                <div className="mt-4 space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="bg-molt-surface border border-molt-border rounded-lg p-3 space-y-2 animate-pulse"
                      style={{ animationDelay: `${i * 150}ms` }}>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-4 bg-molt-border/50 rounded" />
                        <div className="flex-1 h-3 bg-molt-border/30 rounded" />
                      </div>
                      <div className="h-3 bg-molt-border/20 rounded w-3/4" />
                    </div>
                  ))}
                  <p className="text-[10px] text-molt-muted text-center animate-pulse">
                    Evaluating 4 test scenarios with your persona...
                  </p>
                </div>
              )}
              {testResults && (
                <div className="mt-4">
                  <DecisionTestResults
                    results={testResults.results}
                    provider={testResults.provider}
                    commentStrategy={testResults.comment_strategy_active}
                    postStrategy={testResults.post_strategy_active}
                  />
                </div>
              )}
            </SectionCard>

            {/* Voice Preview */}
            <SectionCard title="Voice Preview">
              <p className="text-[10px] text-molt-muted mb-3">
                See how your agent responds to a sample post using the current persona voice.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-molt-muted mb-1.5 block">Test with model</label>
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setPreviewProvider(null)}
                      className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                        previewProvider === null ? 'bg-molt-accent text-white' : 'bg-molt-surface text-molt-muted hover:text-molt-text border border-molt-border'
                      }`}>
                      Default ({LLM_PROVIDERS.find(p => p.id === (activePersona.llm_provider ?? 'claude'))?.label})
                    </button>
                    {LLM_PROVIDERS.map((p) => (
                      <button key={p.id} onClick={() => setPreviewProvider(p.id)}
                        className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                          previewProvider === p.id ? 'bg-molt-accent text-white' : 'bg-molt-surface text-molt-muted hover:text-molt-text border border-molt-border'
                        }`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handlePreview} className="btn-secondary text-sm inline-flex items-center gap-2" disabled={previewing}>
                  {previewing && (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                      className="animate-spin text-molt-accent shrink-0" strokeLinecap="round">
                      <path d="M14 8A6 6 0 112.5 5.5" />
                    </svg>
                  )}
                  {previewing ? 'Generating...' : 'Generate Preview'}
                </button>
                {preview && (
                  <div className="bg-molt-bg rounded-lg p-3">
                    {previewUsedProvider && (
                      <div className="text-[10px] text-molt-muted mb-1.5">
                        Generated with: {LLM_PROVIDERS.find(p => p.id === previewUsedProvider)?.label ?? previewUsedProvider}
                      </div>
                    )}
                    <p className="text-sm text-molt-text whitespace-pre-wrap">{preview}</p>
                  </div>
                )}
              </div>
            </SectionCard>
          </Section>
        )}
      </div>
    </div>
  )
}
