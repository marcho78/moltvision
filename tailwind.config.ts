import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        molt: {
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
} satisfies Config
