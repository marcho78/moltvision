import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        molt: {
          bg: 'rgb(var(--molt-bg) / <alpha-value>)',
          surface: 'rgb(var(--molt-surface) / <alpha-value>)',
          border: 'rgb(var(--molt-border) / <alpha-value>)',
          text: 'rgb(var(--molt-text) / <alpha-value>)',
          muted: 'rgb(var(--molt-muted) / <alpha-value>)',
          accent: 'rgb(var(--molt-accent) / <alpha-value>)',
          'accent-hover': 'rgb(var(--molt-accent-hover) / <alpha-value>)',
          success: 'rgb(var(--molt-success) / <alpha-value>)',
          warning: 'rgb(var(--molt-warning) / <alpha-value>)',
          error: 'rgb(var(--molt-error) / <alpha-value>)',
          info: 'rgb(var(--molt-info) / <alpha-value>)'
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
