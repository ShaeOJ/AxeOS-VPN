/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Use CSS variables for theme support
        'bg-primary': 'var(--color-bg-primary)',
        'bg-secondary': 'var(--color-bg-secondary)',
        'bg-tertiary': 'var(--color-bg-tertiary)',
        'bg-terminal': 'var(--color-bg-terminal)',

        // Primary accent (changes with theme)
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-dim': 'var(--color-accent-dim)',

        // Success/Terminal green (changes with theme)
        success: 'var(--color-success)',
        'success-dim': 'var(--color-success-dim)',

        // Warning
        warning: 'var(--color-warning)',

        // Danger
        danger: 'var(--color-danger)',

        // Text colors (change with theme)
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-terminal': 'var(--color-text-terminal)',

        // Borders (change with theme)
        border: 'var(--color-border)',
        'border-highlight': 'var(--color-border-highlight)',
        'border-glow': 'var(--color-border-glow)',

        // Special colors (change with theme)
        'vault-yellow': 'var(--color-vault-yellow)',
        'vault-blue': 'var(--color-vault-blue)',
        'pip-green': 'var(--color-pip-green)',
      },
      fontFamily: {
        sans: ['Share Tech Mono', 'JetBrains Mono', 'Consolas', 'monospace'],
        mono: ['Share Tech Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Orbitron', 'Share Tech Mono', 'monospace'],
      },
      boxShadow: {
        'vault': '0 0 10px color-mix(in srgb, var(--color-accent) 30%, transparent), inset 0 0 20px rgba(0, 0, 0, 0.5)',
        'vault-glow': '0 0 20px color-mix(in srgb, var(--color-accent) 50%, transparent)',
        'terminal': '0 0 10px color-mix(in srgb, var(--color-success) 30%, transparent)',
        'terminal-glow': '0 0 20px color-mix(in srgb, var(--color-success) 50%, transparent)',
      },
      animation: {
        'scanline': 'scanline 8s linear infinite',
        'flicker': 'flicker 0.15s infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
