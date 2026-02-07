import { useEffect } from 'react'
import { useStore } from '../stores'

export function useKeyboard() {
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K — command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        toggleCommandPalette()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleCommandPalette])
}
