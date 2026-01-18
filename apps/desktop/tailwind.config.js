/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Vault-Tec Theme - Retro-futuristic
        'bg-primary': '#0a1929',      // Deep navy blue
        'bg-secondary': '#0d2137',    // Slightly lighter navy
        'bg-tertiary': '#112a45',     // Card backgrounds
        'bg-terminal': '#001a0d',     // Terminal green background

        // Vault-Tec Yellow/Amber - Primary accent
        accent: '#FFB000',
        'accent-hover': '#FFC940',
        'accent-dim': '#CC8C00',

        // Pip-Boy Green - Success/Terminal
        success: '#00FF41',
        'success-dim': '#00CC33',

        // Warning - Orange
        warning: '#FF8C00',

        // Danger - Red
        danger: '#FF3131',

        // Text colors
        'text-primary': '#E8F4E8',    // Slight green tint
        'text-secondary': '#8BA88B',  // Muted green-gray
        'text-terminal': '#00FF41',   // Bright terminal green

        // Borders - Teal/Cyan accents
        border: '#1a4a5c',
        'border-highlight': '#00CED1',
        'border-glow': '#20B2AA',

        // Special Vault-Tec colors
        'vault-yellow': '#FFB000',
        'vault-blue': '#0055AA',
        'pip-green': '#00FF41',
      },
      fontFamily: {
        sans: ['Share Tech Mono', 'JetBrains Mono', 'Consolas', 'monospace'],
        mono: ['Share Tech Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Orbitron', 'Share Tech Mono', 'monospace'],
      },
      boxShadow: {
        'vault': '0 0 10px rgba(255, 176, 0, 0.3), inset 0 0 20px rgba(0, 0, 0, 0.5)',
        'vault-glow': '0 0 20px rgba(255, 176, 0, 0.5)',
        'terminal': '0 0 10px rgba(0, 255, 65, 0.3)',
        'terminal-glow': '0 0 20px rgba(0, 255, 65, 0.5)',
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
