import { useEffect, useCallback, useRef } from 'react'
import { useStore } from '../stores'
import { invoke } from '../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { FeedListResponse } from '@shared/ipc-payloads'

export function useLiveFeed(interval = 15000) {
  const { sortOrder, selectedSubmolt, setPosts, appendPosts, setFeedLoading } = useStore()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchFeed = useCallback(async (cursor?: string) => {
    setFeedLoading(true)
    try {
      const result = await invoke<FeedListResponse>(IPC.FEED_LIST, {
        sort: sortOrder,
        submolt: selectedSubmolt,
        limit: 25
      })
      if (cursor) {
        appendPosts(result.posts, result.next_cursor)
      } else {
        setPosts(result.posts)
      }
    } catch (err) {
      console.error('Feed fetch error:', err)
    } finally {
      setFeedLoading(false)
    }
  }, [sortOrder, selectedSubmolt, setPosts, appendPosts, setFeedLoading])

  useEffect(() => {
    fetchFeed()
    timerRef.current = setInterval(() => fetchFeed(), interval)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchFeed, interval])

  return { refresh: () => fetchFeed(), loadMore: () => fetchFeed(useStore.getState().cursor ?? undefined) }
}
