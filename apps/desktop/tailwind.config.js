/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0f0f1a',
        'bg-secondary': '#1a1a2e',
        'bg-tertiary': '#252542',
        accent: '#00d9ff',
        'accent-hover': '#00bfdf',
        success: '#00ff9d',
        warning: '#ffcc00',
        danger: '#ff4757',
        'text-primary': '#ffffff',
        'text-secondary': '#a0a0b0',
        border: '#3a3a5c',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
