import type { ThemeColors, ThemePresetId } from './domain.types'

/** Current dark theme — unchanged visual baseline */
export const DEFAULT_COLORS: ThemeColors = {
  bg: '#0f0f13',
  surface: '#1a1a24',
  border: '#2a2a3a',
  text: '#e0e0e8',
  muted: '#8888a0',
  accent: '#7c5cfc',
  'accent-hover': '#9b7eff',
  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
  info: '#3b82f6'
}

export interface ThemePreset {
  id: ThemePresetId
  name: string
  colors: ThemeColors
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'dark',
    name: 'Dark',
    colors: DEFAULT_COLORS
  },
  {
    id: 'midnight',
    name: 'Midnight Blue',
    colors: {
      bg: '#0b1120',
      surface: '#111827',
      border: '#1e2d4a',
      text: '#e2e8f0',
      muted: '#64748b',
      accent: '#38bdf8',
      'accent-hover': '#7dd3fc',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#60a5fa'
    }
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: {
      bg: '#0c1410',
      surface: '#14201a',
      border: '#1e3a2c',
      text: '#d4e7dc',
      muted: '#6b8f7b',
      accent: '#4ade80',
      'accent-hover': '#86efac',
      success: '#22c55e',
      warning: '#facc15',
      error: '#fb7185',
      info: '#67e8f9'
    }
  },
  {
    id: 'warm',
    name: 'Warm Ember',
    colors: {
      bg: '#141210',
      surface: '#1f1b17',
      border: '#3a3226',
      text: '#e8e0d4',
      muted: '#a09080',
      accent: '#f59e0b',
      'accent-hover': '#fbbf24',
      success: '#84cc16',
      warning: '#fb923c',
      error: '#ef4444',
      info: '#38bdf8'
    }
  },
  {
    id: 'light',
    name: 'Light',
    colors: {
      bg: '#f5f5f7',
      surface: '#ffffff',
      border: '#d1d5db',
      text: '#1f2937',
      muted: '#6b7280',
      accent: '#7c3aed',
      'accent-hover': '#8b5cf6',
      success: '#16a34a',
      warning: '#ca8a04',
      error: '#dc2626',
      info: '#2563eb'
    }
  }
]

/** Display names for the color picker UI */
export const THEME_TOKEN_LABELS: Record<keyof ThemeColors, string> = {
  bg: 'Background',
  surface: 'Surface',
  border: 'Border',
  text: 'Text',
  muted: 'Muted Text',
  accent: 'Accent',
  'accent-hover': 'Accent Hover',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  info: 'Info'
}

/**
 * Convert hex color to space-separated RGB channels.
 * Tailwind opacity modifiers require `rgb(var(--x) / <alpha>)` format,
 * so CSS vars store channels only (e.g. "124 92 252"), not full hex.
 */
export function hexToChannels(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/** Resolve the active theme colors: preset lookup or custom passthrough */
export function resolveThemeColors(
  presetId: ThemePresetId | 'custom',
  customColors: ThemeColors | null
): ThemeColors {
  if (presetId === 'custom' && customColors) return customColors
  const preset = THEME_PRESETS.find((p) => p.id === presetId)
  return preset?.colors ?? DEFAULT_COLORS
}
