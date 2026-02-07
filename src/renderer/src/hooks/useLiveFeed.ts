import { useEffect, useCallback, useRef } from 'react'
import { useStore } from '../stores'
import { invoke } from '../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { FeedListResponse } from '@shared/ipc-payloads'

export function useLiveFeed(interval = 15000) {
  const { sortOrder, feedSource, selectedSubmolt, setPosts, appendPosts, setFeedLoading } = useStore()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fetchingRef = useRef(false)

  const fetchFeed = useCallback(async (offset?: number) => {
    // Prevent duplicate concurrent fetches (StrictMode double-mount)
    if (!offset && fetchingRef.current) return
    fetchingRef.current = true
    setFeedLoading(true)
    try {
      let result: FeedListResponse

      if (feedSource === 'subscribed') {
        // GET /feed — personalized (subscriptions + follows)
        const raw = await invoke<any>(IPC.FEED_PERSONALIZED, {
          sort: sortOrder,
          limit: 25,
          offset: offset ?? undefined
        })
        const posts = raw?.posts ?? raw ?? []
        result = {
          posts: Array.isArray(posts) ? posts : [],
          next_offset: raw?.next_offset ?? null,
          has_more: raw?.has_more ?? false
        }
      } else if (feedSource === 'submolt' && selectedSubmolt) {
        // GET /submolts/{name}/feed — single community
        const raw = await invoke<any>(IPC.SUBMOLTS_GET_FEED, {
          submolt_name: selectedSubmolt,
          sort: sortOrder,
          limit: 25
        })
        const posts = raw?.posts ?? raw ?? []
        result = {
          posts: Array.isArray(posts) ? posts : [],
          next_offset: null,
          has_more: false
        }
      } else {
        // GET /posts — global feed
        result = await invoke<FeedListResponse>(IPC.FEED_LIST, {
          sort: sortOrder,
          limit: 25,
          offset: offset ?? undefined
        })
      }

      if (offset) {
        appendPosts(result.posts, result.next_offset, result.has_more)
      } else {
        setPosts(result.posts, result.next_offset, result.has_more)
      }
    } catch (err) {
      console.error('Feed fetch error:', err)
    } finally {
      fetchingRef.current = false
      setFeedLoading(false)
    }
  }, [sortOrder, feedSource, selectedSubmolt, setPosts, appendPosts, setFeedLoading])

  useEffect(() => {
    fetchFeed()
    timerRef.current = setInterval(() => fetchFeed(), interval)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchFeed, interval])

  const loadMore = useCallback(() => {
    const { nextOffset } = useStore.getState()
    if (nextOffset != null) {
      fetchFeed(nextOffset)
    }
  }, [fetchFeed])

  return { refresh: () => fetchFeed(), loadMore }
}
