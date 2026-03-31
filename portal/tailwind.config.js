/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        accent: 'var(--accent)',
        bg:     'var(--bg)',
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        border: {
          DEFAULT: 'var(--border)',
          hover: 'var(--border-hover)',
        },
        text: {
          DEFAULT: 'var(--text)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
        },
      },
      animation: {
        'fade-in':         'fade-in 0.2s ease-out forwards',
        'slide-in-right':  'slide-in-right 0.25s ease-out forwards',
      },
      keyframes: {
        'fade-in':        { from: { opacity: '0', transform: 'translateY(5px)' },    to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-right': { from: { opacity: '0', transform: 'translateX(20px)' },   to: { opacity: '1', transform: 'translateX(0)' } },
      },
    },
  },
  plugins: [],
}
