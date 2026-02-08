import { EventEmitter } from 'events'
import log from 'electron-log'
import type { ChatMessage, ChatRequest, ChatResponse, StreamChunk, LLMProviderName, KeyValidationResult, ProviderHealth, TokenCountResult } from '../../shared/domain.types'
import { recordTokenUsage } from '../db/queries/analytics.queries'

// --- LLM Provider Interface ---

export interface LLMProvider {
  name: LLMProviderName
  defaultModel: string
  chat(request: ChatRequest): Promise<ChatResponse>
  chatStream(request: ChatRequest): AsyncGenerator<StreamChunk>
  countTokens(messages: ChatMessage[]): Promise<TokenCountResult>
  validateKey(): Promise<KeyValidationResult>
  healthCheck(): Promise<ProviderHealth>
  setApiKey(key: string): void
}

// --- Error Types ---

export class LLMError extends Error {
  constructor(public provider: LLMProviderName, message: string) {
    super(message)
    this.name = 'LLMError'
  }
}

export class LLMAuthenticationError extends LLMError {
  constructor(provider: LLMProviderName) {
    super(provider, `Authentication failed for ${provider}`)
    this.name = 'LLMAuthenticationError'
  }
}

export class LLMRateLimitError extends LLMError {
  constructor(provider: LLMProviderName, public retryAfter?: number) {
    super(provider, `Rate limited by ${provider}`)
    this.name = 'LLMRateLimitError'
  }
}

export class ProviderUnavailableError extends LLMError {
  constructor(provider: LLMProviderName) {
    super(provider, `Provider ${provider} is unavailable`)
    this.name = 'ProviderUnavailableError'
  }
}

export class ContentFilterError extends LLMError {
  constructor(provider: LLMProviderName) {
    super(provider, `Content filtered by ${provider}`)
    this.name = 'ContentFilterError'
  }
}

export class TokenLimitExceededError extends LLMError {
  constructor(provider: LLMProviderName, public limit: number) {
    super(provider, `Token limit exceeded for ${provider}: ${limit}`)
    this.name = 'TokenLimitExceededError'
  }
}

// --- JSON cleaning helper ---
// LLMs frequently return JSON wrapped in markdown fences or with trailing text.
// This extracts just the JSON object/array so JSON.parse() works reliably.
export function cleanJsonResponse(raw: string): string {
  let s = raw.trim()

  // Strip opening ```json or ``` line
  if (s.startsWith('```')) {
    const firstNewline = s.indexOf('\n')
    if (firstNewline !== -1) {
      s = s.slice(firstNewline + 1)
    }
  }
  // Strip trailing ``` line
  if (s.trimEnd().endsWith('```')) {
    s = s.slice(0, s.lastIndexOf('```'))
  }
  s = s.trim()

  // Extract just the JSON object/array — handles:
  // - Trailing explanatory text after JSON: {"foo":"bar"} This is because...
  // - Leading prose before JSON: Looking at this post, {"foo":"bar"}
  // - Both combined
  // Find the first { or [ anywhere in the string and match its closing bracket
  const jsonStart = findFirstJsonChar(s)
  if (jsonStart >= 0) {
    const startChar = s.charAt(jsonStart)
    const closeChar = startChar === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escape = false
    for (let i = jsonStart; i < s.length; i++) {
      const c = s.charAt(i)
      if (escape) { escape = false; continue }
      if (c === '\\' && inString) { escape = true; continue }
      if (c === '"' && !escape) { inString = !inString; continue }
      if (inString) continue
      if (c === startChar) depth++
      else if (c === closeChar) {
        depth--
        if (depth === 0) {
          return s.slice(jsonStart, i + 1)
        }
      }
    }
  }

  return s
}

function findFirstJsonChar(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if (s.charAt(i) === '{' || s.charAt(i) === '[') return i
  }
  return -1
}

// --- Claude Provider ---

export class ClaudeProvider implements LLMProvider {
  name: LLMProviderName = 'claude'
  defaultModel = 'claude-sonnet-4-5-20250929'
  private apiKey = ''

  setApiKey(key: string): void { this.apiKey = key }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: this.apiKey })
    const systemMsg = request.messages.find(m => m.role === 'system')?.content
    const messages = request.messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

    const start = Date.now()
    const response = await client.messages.create({
      model: this.defaultModel,
      max_tokens: request.max_tokens ?? 1024,
      temperature: request.temperature,
      system: systemMsg,
      messages
    })

    const content = response.content.map(c => c.type === 'text' ? c.text : '').join('')
    return {
      content,
      provider: 'claude',
      model: this.defaultModel,
      tokens_input: response.usage.input_tokens,
      tokens_output: response.usage.output_tokens,
      cost: this.estimateCost(response.usage.input_tokens, response.usage.output_tokens),
      latency_ms: Date.now() - start
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: this.apiKey })
    const systemMsg = request.messages.find(m => m.role === 'system')?.content
    const messages = request.messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

    const stream = await client.messages.stream({
      model: this.defaultModel,
      max_tokens: request.max_tokens ?? 1024,
      temperature: request.temperature,
      system: systemMsg,
      messages
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { content: event.delta.text, done: false, provider: 'claude' }
      }
    }
    yield { content: '', done: true, provider: 'claude' }
  }

  async countTokens(messages: ChatMessage[]): Promise<TokenCountResult> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: this.apiKey })
    const systemMsg = messages.find(m => m.role === 'system')?.content
    const filtered = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))
    const result = await client.messages.countTokens({
      model: this.defaultModel,
      system: systemMsg,
      messages: filtered
    })
    return { count: result.input_tokens, provider: 'claude' }
  }

  async validateKey(): Promise<KeyValidationResult> {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: this.apiKey })
      await client.messages.create({
        model: this.defaultModel,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      })
      return { valid: true, provider: 'claude' }
    } catch (err: any) {
      return { valid: false, provider: 'claude', error: err.message }
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      await this.validateKey()
      return { provider: 'claude', available: true, latency_ms: Date.now() - start }
    } catch (err: any) {
      return { provider: 'claude', available: false, latency_ms: Date.now() - start, error: err.message }
    }
  }

  private estimateCost(input: number, output: number): number {
    return (input * 0.003 + output * 0.015) / 1000
  }
}

// --- OpenAI Provider ---

export class OpenAIProvider implements LLMProvider {
  name: LLMProviderName = 'openai'
  defaultModel = 'gpt-4o'
  private apiKey = ''

  setApiKey(key: string): void { this.apiKey = key }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: this.apiKey })
    const messages = request.messages.map(m => ({ role: m.role, content: m.content }))
    const start = Date.now()

    const response = await client.chat.completions.create({
      model: this.defaultModel,
      messages: messages as any,
      temperature: request.temperature,
      max_tokens: request.max_tokens ?? 1024,
      response_format: request.json_mode ? { type: 'json_object' } : undefined
    })

    const choice = response.choices[0]
    return {
      content: choice.message.content ?? '',
      provider: 'openai',
      model: this.defaultModel,
      tokens_input: response.usage?.prompt_tokens ?? 0,
      tokens_output: response.usage?.completion_tokens ?? 0,
      cost: this.estimateCost(response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0),
      latency_ms: Date.now() - start
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: this.apiKey })
    const messages = request.messages.map(m => ({ role: m.role, content: m.content }))

    const stream = await client.chat.completions.create({
      model: this.defaultModel,
      messages: messages as any,
      temperature: request.temperature,
      max_tokens: request.max_tokens ?? 1024,
      stream: true
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield { content: delta, done: false, provider: 'openai' }
    }
    yield { content: '', done: true, provider: 'openai' }
  }

  async countTokens(messages: ChatMessage[]): Promise<TokenCountResult> {
    const { encodingForModel } = await import('js-tiktoken')
    const enc = encodingForModel('gpt-4o' as any)
    const text = messages.map(m => m.content).join('\n')
    const tokens = enc.encode(text)
    return { count: tokens.length, provider: 'openai' }
  }

  async validateKey(): Promise<KeyValidationResult> {
    try {
      const { default: OpenAI } = await import('openai')
      const client = new OpenAI({ apiKey: this.apiKey })
      await client.models.list()
      return { valid: true, provider: 'openai' }
    } catch (err: any) {
      return { valid: false, provider: 'openai', error: err.message }
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      await this.validateKey()
      return { provider: 'openai', available: true, latency_ms: Date.now() - start }
    } catch (err: any) {
      return { provider: 'openai', available: false, latency_ms: Date.now() - start, error: err.message }
    }
  }

  private estimateCost(input: number, output: number): number {
    return (input * 0.0025 + output * 0.01) / 1000
  }
}

// --- Gemini Provider ---

export class GeminiProvider implements LLMProvider {
  name: LLMProviderName = 'gemini'
  defaultModel = 'gemini-2.0-flash'
  private apiKey = ''

  setApiKey(key: string): void { this.apiKey = key }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { GoogleGenAI } = await import('@google/genai')
    const client = new GoogleGenAI({ apiKey: this.apiKey })
    const systemMsg = request.messages.find(m => m.role === 'system')?.content
    const contents = request.messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user' as const,
      parts: [{ text: m.content }]
    }))

    const start = Date.now()
    const response = await client.models.generateContent({
      model: this.defaultModel,
      contents,
      config: {
        systemInstruction: systemMsg,
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens ?? 1024,
        responseMimeType: request.json_mode ? 'application/json' : undefined
      }
    })

    const text = response.text ?? ''
    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0

    return {
      content: text,
      provider: 'gemini',
      model: this.defaultModel,
      tokens_input: inputTokens,
      tokens_output: outputTokens,
      cost: this.estimateCost(inputTokens, outputTokens),
      latency_ms: Date.now() - start
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const { GoogleGenAI } = await import('@google/genai')
    const client = new GoogleGenAI({ apiKey: this.apiKey })
    const systemMsg = request.messages.find(m => m.role === 'system')?.content
    const contents = request.messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user' as const,
      parts: [{ text: m.content }]
    }))

    const response = await client.models.generateContentStream({
      model: this.defaultModel,
      contents,
      config: {
        systemInstruction: systemMsg,
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens ?? 1024
      }
    })

    for await (const chunk of response) {
      const text = chunk.text
      if (text) yield { content: text, done: false, provider: 'gemini' }
    }
    yield { content: '', done: true, provider: 'gemini' }
  }

  async countTokens(messages: ChatMessage[]): Promise<TokenCountResult> {
    const { GoogleGenAI } = await import('@google/genai')
    const client = new GoogleGenAI({ apiKey: this.apiKey })
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user' as const,
      parts: [{ text: m.content }]
    }))
    const result = await client.models.countTokens({
      model: this.defaultModel,
      contents
    })
    return { count: result.totalTokens ?? 0, provider: 'gemini' }
  }

  async validateKey(): Promise<KeyValidationResult> {
    try {
      const { GoogleGenAI } = await import('@google/genai')
      const client = new GoogleGenAI({ apiKey: this.apiKey })
      await client.models.generateContent({
        model: this.defaultModel,
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        config: { maxOutputTokens: 1 }
      })
      return { valid: true, provider: 'gemini' }
    } catch (err: any) {
      return { valid: false, provider: 'gemini', error: err.message }
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      await this.validateKey()
      return { provider: 'gemini', available: true, latency_ms: Date.now() - start }
    } catch (err: any) {
      return { provider: 'gemini', available: false, latency_ms: Date.now() - start, error: err.message }
    }
  }

  private estimateCost(input: number, output: number): number {
    return (input * 0.000075 + output * 0.0003) / 1000
  }
}

// --- Grok Provider (uses OpenAI-compatible API) ---

export class GrokProvider implements LLMProvider {
  name: LLMProviderName = 'grok'
  defaultModel = 'grok-3'
  private apiKey = ''

  setApiKey(key: string): void { this.apiKey = key }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: this.apiKey, baseURL: 'https://api.x.ai/v1' })
    const messages = request.messages.map(m => ({ role: m.role, content: m.content }))
    const start = Date.now()

    const response = await client.chat.completions.create({
      model: this.defaultModel,
      messages: messages as any,
      temperature: request.temperature,
      max_tokens: request.max_tokens ?? 1024,
      response_format: request.json_mode ? { type: 'json_object' } : undefined
    })

    const choice = response.choices[0]
    return {
      content: choice.message.content ?? '',
      provider: 'grok',
      model: this.defaultModel,
      tokens_input: response.usage?.prompt_tokens ?? 0,
      tokens_output: response.usage?.completion_tokens ?? 0,
      cost: this.estimateCost(response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0),
      latency_ms: Date.now() - start
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: this.apiKey, baseURL: 'https://api.x.ai/v1' })
    const messages = request.messages.map(m => ({ role: m.role, content: m.content }))

    const stream = await client.chat.completions.create({
      model: this.defaultModel,
      messages: messages as any,
      temperature: request.temperature,
      max_tokens: request.max_tokens ?? 1024,
      stream: true
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield { content: delta, done: false, provider: 'grok' }
    }
    yield { content: '', done: true, provider: 'grok' }
  }

  async countTokens(messages: ChatMessage[]): Promise<TokenCountResult> {
    // Estimated using char count / 4 for Grok
    const text = messages.map(m => m.content).join('\n')
    return { count: Math.ceil(text.length / 4), provider: 'grok' }
  }

  async validateKey(): Promise<KeyValidationResult> {
    try {
      const { default: OpenAI } = await import('openai')
      const client = new OpenAI({ apiKey: this.apiKey, baseURL: 'https://api.x.ai/v1' })
      await client.models.list()
      return { valid: true, provider: 'grok' }
    } catch (err: any) {
      return { valid: false, provider: 'grok', error: err.message }
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      await this.validateKey()
      return { provider: 'grok', available: true, latency_ms: Date.now() - start }
    } catch (err: any) {
      return { provider: 'grok', available: false, latency_ms: Date.now() - start, error: err.message }
    }
  }

  private estimateCost(input: number, output: number): number {
    return (input * 0.005 + output * 0.015) / 1000
  }
}

// --- LLM Manager Orchestrator ---

export class LLMManager extends EventEmitter {
  private providers = new Map<LLMProviderName, LLMProvider>()
  private activeProvider: LLMProviderName = 'claude'
  private fallbackProvider: LLMProviderName | null = null
  private abortController: AbortController | null = null

  constructor() {
    super()
    this.providers.set('claude', new ClaudeProvider())
    this.providers.set('openai', new OpenAIProvider())
    this.providers.set('gemini', new GeminiProvider())
    this.providers.set('grok', new GrokProvider())
  }

  setApiKey(provider: LLMProviderName, key: string): void {
    this.providers.get(provider)?.setApiKey(key)
  }

  setActiveProvider(provider: LLMProviderName): void {
    this.activeProvider = provider
    this.emit('provider:changed', provider)
  }

  setFallbackProvider(provider: LLMProviderName | null): void {
    this.fallbackProvider = provider
  }

  getActiveProvider(): LLMProviderName {
    return this.activeProvider
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const providerName = request.provider ?? this.activeProvider
    try {
      const provider = this.providers.get(providerName)
      if (!provider) throw new ProviderUnavailableError(providerName)

      const response = await provider.chat(request)
      this.emit('call:completed', { provider: providerName, tokens: response.tokens_input + response.tokens_output, cost: response.cost })
      this.logTokenUsage(request, response)
      return response
    } catch (err) {
      this.emit('call:failed', { provider: providerName, error: err })

      if (this.fallbackProvider && this.fallbackProvider !== providerName) {
        log.warn(`Falling back from ${providerName} to ${this.fallbackProvider}`)
        this.emit('fallback:triggered', { from: providerName, to: this.fallbackProvider })
        const fallback = this.providers.get(this.fallbackProvider)
        if (fallback) {
          const response = await fallback.chat(request)
          this.emit('call:completed', { provider: this.fallbackProvider, tokens: response.tokens_input + response.tokens_output, cost: response.cost })
          this.logTokenUsage(request, response)
          return response
        }
      }
      throw err
    }
  }

  private logTokenUsage(request: ChatRequest, response: ChatResponse): void {
    try {
      recordTokenUsage({
        purpose: request.purpose ?? 'manual_generation',
        provider: response.provider,
        model: response.model,
        tokens_input: response.tokens_input,
        tokens_output: response.tokens_output,
        persona_id: null
      })
    } catch (err) {
      // Non-critical — don't let tracking failures break LLM calls
      log.warn('Failed to record token usage:', err)
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const providerName = request.provider ?? this.activeProvider
    const provider = this.providers.get(providerName)
    if (!provider) throw new ProviderUnavailableError(providerName)
    yield* provider.chatStream(request)
  }

  async countTokens(messages: ChatMessage[], provider?: LLMProviderName): Promise<TokenCountResult> {
    const p = this.providers.get(provider ?? this.activeProvider)
    if (!p) throw new ProviderUnavailableError(provider ?? this.activeProvider)
    return p.countTokens(messages)
  }

  async validateKey(provider: LLMProviderName): Promise<KeyValidationResult> {
    const p = this.providers.get(provider)
    if (!p) return { valid: false, provider, error: 'Provider not found' }
    return p.validateKey()
  }

  async healthCheckAll(): Promise<ProviderHealth[]> {
    const checks = Array.from(this.providers.values()).map(p => p.healthCheck())
    return Promise.all(checks)
  }

  cancelAllRequests(): void {
    this.abortController?.abort()
    this.abortController = new AbortController()
  }
}

export const llmManager = new LLMManager()
