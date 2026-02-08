import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useStore } from '../../stores'
import { invoke, on } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { SearchResult } from '@shared/domain.types'

// ─── Types ──────────────────────────────────────────────

type SearchTypeFilter = 'all' | 'posts' | 'comments'
type SearchSort = 'relevance' | 'newest' | 'upvotes'

interface CacheStatus {
  syncing: boolean
  cached: number
  total: number
  phase: string
}

// ─── Submolt Picker (IPC-backed, searches all cached submolts) ───

function SubmoltPicker({
  value,
  onChange,
  onSubmit,
  cacheStatus
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  cacheStatus: CacheStatus
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Search cached submolts via IPC (debounced)
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const resp = await invoke<{ submolts: any[] }>(IPC.SUBMOLTS_SEARCH_CACHED, {
          keyword: query.trim(),
          limit: 20
        })
        setSuggestions(resp?.submolts ?? [])
      } catch {
        setSuggestions([])
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, open])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = (name: string) => {
    onChange(name)
    setQuery('')
    setOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setQuery('')
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // If user typed something and there are suggestions, select the first one
      // If no suggestions or empty query, accept free text and trigger search
      if (query.trim() && suggestions.length > 0) {
        handleSelect(suggestions[0].name)
      } else if (query.trim()) {
        // Accept free-text entry (user knows the exact submolt name)
        onChange(query.trim())
        setQuery('')
        setOpen(false)
      } else {
        onSubmit()
      }
    }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      {value ? (
        <div className="input-field text-xs flex items-center gap-1.5 h-full">
          <span className="text-molt-text truncate">m/{value}</span>
          <button
            onClick={handleClear}
            className="ml-auto text-molt-muted hover:text-molt-text text-xs shrink-0"
          >
            &times;
          </button>
        </div>
      ) : (
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Filter by submolt..."
          className="input-field w-full text-xs"
        />
      )}
      {open && !value && (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-molt-surface border border-molt-border rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {/* Cache sync status bar */}
          {cacheStatus.syncing && (
            <div className="px-3 py-1.5 border-b border-molt-border bg-molt-accent/5 flex items-center gap-2">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                className="animate-spin text-molt-accent shrink-0" strokeLinecap="round">
                <path d="M14 8A6 6 0 112.5 5.5" />
              </svg>
              <span className="text-[10px] text-molt-muted truncate">{cacheStatus.phase}</span>
            </div>
          )}
          {!cacheStatus.syncing && cacheStatus.cached > 0 && (
            <div className="px-3 py-1 border-b border-molt-border">
              <span className="text-[10px] text-molt-muted">
                {cacheStatus.cached.toLocaleString()} submolts indexed
              </span>
            </div>
          )}

          {searching ? (
            <div className="px-3 py-2 text-xs text-molt-muted flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                className="animate-spin" strokeLinecap="round">
                <path d="M14 8A6 6 0 112.5 5.5" />
              </svg>
              Searching...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-molt-muted">
              {cacheStatus.syncing ? (
                <span className="flex items-center gap-1.5">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                    className="animate-spin text-molt-accent" strokeLinecap="round">
                    <path d="M14 8A6 6 0 112.5 5.5" />
                  </svg>
                  Syncing submolts...
                </span>
              ) : cacheStatus.cached === 0 ? (
                <>No submolts synced. Sync from <strong className="text-molt-accent">Settings &gt; Data</strong>, or type a name and press Enter.</>
              ) : query.trim() ? (
                <>No matches. Press Enter to use &ldquo;{query.trim()}&rdquo; directly.</>
              ) : (
                'Type to search submolts'
              )}
            </div>
          ) : (
            suggestions.map(s => (
              <button
                key={s.id}
                onClick={() => handleSelect(s.name)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-molt-accent/10 transition-colors flex items-center gap-2"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: s.theme_color || '#7c5cfc' }}
                />
                <span className="text-molt-text truncate">{s.display_name || s.name}</span>
                <span className="text-molt-muted ml-auto text-[10px] shrink-0">
                  {s.subscriber_count?.toLocaleString() ?? 0} subs
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function TypeFilterChips({
  active,
  onChange,
  counts
}: {
  active: SearchTypeFilter
  onChange: (t: SearchTypeFilter) => void
  counts: { all: number; posts: number; comments: number }
}) {
  const chips: { key: SearchTypeFilter; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'posts', label: `Posts (${counts.posts})` },
    { key: 'comments', label: `Comments (${counts.comments})` }
  ]

  return (
    <div className="flex gap-1">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => onChange(c.key)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            active === c.key
              ? 'bg-molt-accent/20 text-molt-accent'
              : 'text-molt-muted hover:text-molt-text hover:bg-molt-surface'
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

// ─── Time Ago ───────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMonth = Math.floor(diffDay / 30)
  return `${diffMonth}mo ago`
}

// ─── Result Card ────────────────────────────────────────

function SearchResultCard({
  result,
  rank,
  onClick
}: {
  result: SearchResult
  rank: number
  onClick: () => void
}) {
  const pct = ((result.score ?? 0) * 100).toFixed(0)
  const karma = (result.upvotes ?? 0) - (result.downvotes ?? 0)

  return (
    <button
      onClick={onClick}
      className="w-full text-left panel-card p-4 hover:border-molt-accent/30 transition-colors cursor-pointer group"
    >
      {/* Top row: rank + type badge + submolt + time */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-molt-muted font-mono">#{rank}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
          result.type === 'post'
            ? 'bg-molt-accent/15 text-molt-accent'
            : 'bg-emerald-500/15 text-emerald-400'
        }`}>
          {result.type}
        </span>
        {result.submolt && (
          <span className="text-[10px] text-molt-muted">
            m/{typeof result.submolt === 'object' ? (result.submolt as any).name : result.submolt}
          </span>
        )}
        <span className="text-[10px] text-molt-muted ml-auto">{timeAgo(result.created_at ?? '')}</span>
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-molt-text group-hover:text-molt-accent transition-colors line-clamp-2 mb-1">
        {result.title}
      </h4>

      {/* Snippet */}
      {result.snippet && (
        <p className="text-xs text-molt-muted line-clamp-2 mb-2">{result.snippet}</p>
      )}

      {/* Bottom row: author + karma + relevance bar */}
      <div className="flex items-center gap-3">
        {result.author && (
          <span className="text-[10px] text-molt-muted">
            {typeof result.author === 'object' ? (result.author as any).username ?? (result.author as any).name : result.author}
          </span>
        )}
        <span className="text-[10px] text-molt-muted flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3v10M4 7l4-4 4 4" />
          </svg>
          {karma}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1 bg-molt-bg rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-molt-accent/60"
              style={{ width: `${Math.max((result.score ?? 0) * 100, 2)}%` }}
            />
          </div>
          <span className="text-[10px] text-molt-muted font-mono w-7 text-right">{pct}%</span>
        </div>
      </div>
    </button>
  )
}

// ─── Empty State ────────────────────────────────────────

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-molt-muted">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-3 opacity-30">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      {hasQuery ? (
        <>
          <p className="text-sm">No results found</p>
          <p className="text-xs mt-1 opacity-60">Try different keywords or a broader query</p>
        </>
      ) : (
        <>
          <p className="text-sm">Search posts and comments</p>
          <p className="text-xs mt-1 opacity-60">Uses semantic AI search — understands meaning, not just keywords</p>
        </>
      )}
    </div>
  )
}

// ─── Main Panel ─────────────────────────────────────────

interface SearchResponse {
  results: SearchResult[]
  next_cursor: string | null
  has_more: boolean
  maxRelevance: number
}

export function SearchExplorerPanel() {
  const {
    searchQuery, searchResults, setSearchQuery, setSearchResults,
    similarityThreshold, setSimilarityThreshold,
    setActivePanel, setActivePost
  } = useStore()
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [typeFilter, setTypeFilter] = useState<SearchTypeFilter>('all')
  const [sortBy, setSortBy] = useState<SearchSort>('relevance')
  const [authorFilter, setAuthorFilter] = useState('')
  const [submoltFilter, setSubmoltFilter] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const nextCursorRef = useRef<string | null>(null)
  const hasMoreRef = useRef(false)
  const maxRelevanceRef = useRef<number>(1)
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>({ syncing: false, cached: 0, total: 0, phase: '' })

  // Listen for submolt cache status updates from main process
  useEffect(() => {
    const unsub = on(IPC.SUBMOLTS_CACHE_STATUS, (status: unknown) => {
      setCacheStatus(status as CacheStatus)
    })
    // Check current cache status (no auto-sync — user must trigger from Settings)
    invoke<{ total_cached: number; syncing: boolean }>(IPC.SUBMOLTS_SEARCH_CACHED, { keyword: '', limit: 1 })
      .then((resp) => {
        setCacheStatus(prev => ({ ...prev, cached: resp?.total_cached ?? 0, syncing: resp?.syncing ?? false }))
      })
      .catch(() => {})
    return unsub
  }, [])

  const searchPayload = useCallback(() => ({
    query: searchQuery,
    type: typeFilter === 'all' ? undefined : typeFilter,
    author: authorFilter.trim() || undefined,
    submolt: submoltFilter.trim() || undefined,
    limit: 50
  }), [searchQuery, typeFilter, authorFilter, submoltFilter])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    setHasSearched(true)
    nextCursorRef.current = null
    hasMoreRef.current = false
    try {
      const resp = await invoke<SearchResponse>(IPC.SEARCH_EXECUTE, searchPayload())
      setSearchResults(resp?.results ?? [])
      nextCursorRef.current = resp?.next_cursor ?? null
      hasMoreRef.current = resp?.has_more ?? false
      maxRelevanceRef.current = resp?.maxRelevance ?? 1
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setLoading(false)
    }
  }, [searchPayload, setSearchResults])

  const handleLoadMore = useCallback(async () => {
    if (!nextCursorRef.current || loadingMore) return
    setLoadingMore(true)
    try {
      const resp = await invoke<SearchResponse>(IPC.SEARCH_EXECUTE, {
        ...searchPayload(),
        cursor: nextCursorRef.current,
        maxRelevance: maxRelevanceRef.current
      })
      const newResults = resp?.results ?? []
      // Deduplicate and append
      const existingIds = new Set(searchResults.map(r => r.id))
      const unique = newResults.filter(r => !existingIds.has(r.id))
      setSearchResults([...searchResults, ...unique])
      nextCursorRef.current = resp?.next_cursor ?? null
      hasMoreRef.current = resp?.has_more ?? false
    } catch (err) {
      console.error('Load more error:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [searchPayload, searchResults, setSearchResults, loadingMore])

  // Filter by type + threshold, then sort
  const filteredResults = useMemo(() => {
    let results = searchResults.filter(r => (r.score ?? 0) >= similarityThreshold)
    if (typeFilter === 'posts') results = results.filter(r => r.type === 'post')
    else if (typeFilter === 'comments') results = results.filter(r => r.type === 'comment')

    if (sortBy === 'newest') {
      results = [...results].sort((a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      )
    } else if (sortBy === 'upvotes') {
      results = [...results].sort((a, b) =>
        ((b.upvotes ?? 0) - (b.downvotes ?? 0)) - ((a.upvotes ?? 0) - (a.downvotes ?? 0))
      )
    }

    return results
  }, [searchResults, similarityThreshold, typeFilter, sortBy])

  const typeCounts = useMemo(() => {
    const above = searchResults.filter(r => (r.score ?? 0) >= similarityThreshold)
    return {
      all: above.length,
      posts: above.filter(r => r.type === 'post').length,
      comments: above.filter(r => r.type === 'comment').length
    }
  }, [searchResults, similarityThreshold])

  const handleResultClick = (result: SearchResult) => {
    const postId = result.type === 'comment' ? result.post_id : result.id
    if (postId) {
      setActivePost(postId)
      setActivePanel('conversation')
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-molt-border space-y-2.5">
        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-molt-muted"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search posts and comments..."
              className="input-field w-full text-sm pl-9"
            />
          </div>
          <button onClick={handleSearch} className="btn-primary text-sm px-4" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                  className="animate-spin" strokeLinecap="round">
                  <path d="M14 8A6 6 0 112.5 5.5" />
                </svg>
                Searching
              </span>
            ) : 'Search'}
          </button>
        </div>

        {/* Author + Submolt filters */}
        <div className="flex gap-2">
          <input
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Filter by author..."
            className="input-field flex-1 text-xs"
          />
          <SubmoltPicker
            value={submoltFilter}
            onChange={setSubmoltFilter}
            onSubmit={handleSearch}
            cacheStatus={cacheStatus}
          />
        </div>

        {/* Submolt cache sync indicator */}
        {cacheStatus.syncing && (
          <div className="flex items-center gap-2 px-1">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
              className="animate-spin text-molt-accent shrink-0" strokeLinecap="round">
              <path d="M14 8A6 6 0 112.5 5.5" />
            </svg>
            <span className="text-[10px] text-molt-muted">{cacheStatus.phase}</span>
            {cacheStatus.total > 0 && (
              <div className="flex-1 h-1 bg-molt-bg rounded-full overflow-hidden max-w-32">
                <div
                  className="h-full bg-molt-accent/40 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((cacheStatus.cached / cacheStatus.total) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Filters row */}
        {searchResults.length > 0 && (
          <div className="flex items-center gap-3">
            <TypeFilterChips active={typeFilter} onChange={setTypeFilter} counts={typeCounts} />

            <div className="h-4 w-px bg-molt-border" />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SearchSort)}
              className="bg-molt-surface border border-molt-border rounded-md px-2 py-1 text-xs text-molt-text"
            >
              <option value="relevance">Most relevant</option>
              <option value="newest">Newest first</option>
              <option value="upvotes">Most upvoted</option>
            </select>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-molt-muted whitespace-nowrap">Min</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                className="w-20"
              />
              <span className="text-[10px] text-molt-muted font-mono w-7 text-right">
                {(similarityThreshold * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && searchResults.length === 0 && (
          <div className="flex items-center justify-center h-40 text-molt-muted text-sm">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                className="animate-spin" strokeLinecap="round">
                <path d="M14 8A6 6 0 112.5 5.5" />
              </svg>
              Searching...
            </div>
          </div>
        )}

        {!loading && filteredResults.length === 0 && searchResults.length === 0 && (
          <EmptyState hasQuery={hasSearched} />
        )}

        {filteredResults.length > 0 && (
          <div className="p-3 space-y-2 max-w-3xl mx-auto">
            {/* Result count */}
            <div className="text-xs text-molt-muted px-1 pb-1">
              {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
              {filteredResults.length < searchResults.length && (
                <span> (filtered from {searchResults.length})</span>
              )}
              {searchQuery && <span> for &ldquo;{searchQuery}&rdquo;</span>}
            </div>

            {filteredResults.map((r, i) => (
              <SearchResultCard
                key={r.id}
                result={r}
                rank={i + 1}
                onClick={() => handleResultClick(r)}
              />
            ))}

            {/* Load more button */}
            {hasMoreRef.current && (
              <div className="pt-2 pb-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full py-2.5 rounded-lg border border-molt-border text-sm text-molt-muted hover:text-molt-text hover:border-molt-accent/30 transition-colors"
                >
                  {loadingMore ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                        className="animate-spin" strokeLinecap="round">
                        <path d="M14 8A6 6 0 112.5 5.5" />
                      </svg>
                      Loading more...
                    </span>
                  ) : 'Load more results'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Threshold filtering notice */}
        {!loading && filteredResults.length === 0 && searchResults.length > 0 && (
          <div className="flex flex-col items-center justify-center h-full text-molt-muted">
            <p className="text-sm">All {searchResults.length} results filtered out</p>
            <p className="text-xs mt-1 opacity-60">
              Lower the minimum relevance threshold ({(similarityThreshold * 100).toFixed(0)}%) to see results
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
