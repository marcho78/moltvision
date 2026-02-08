import { useEffect } from 'react'
import { useStore } from '../stores'
import { hexToChannels, resolveThemeColors } from '@shared/theme-presets'
import type { ThemeColors } from '@shared/domain.types'

const TOKEN_KEYS: (keyof ThemeColors)[] = [
  'bg', 'surface', 'border', 'text', 'muted',
  'accent', 'accent-hover', 'success', 'warning', 'error', 'info'
]

/** Set CSS custom properties on :root so Tailwind picks them up at runtime */
export function applyThemeToDOM(colors: ThemeColors): void {
  const root = document.documentElement
  for (const key of TOKEN_KEYS) {
    root.style.setProperty(`--molt-${key}`, hexToChannels(colors[key]))
  }
}

/**
 * Watches the store's theme + themeCustomColors and applies CSS vars on change.
 * Call once in App — it handles mount + every subsequent change.
 */
export function useTheme(): void {
  const theme = useStore((s) => s.theme)
  const themeCustomColors = useStore((s) => s.themeCustomColors)

  useEffect(() => {
    const colors = resolveThemeColors(theme, themeCustomColors)
    applyThemeToDOM(colors)
  }, [theme, themeCustomColors])
}
