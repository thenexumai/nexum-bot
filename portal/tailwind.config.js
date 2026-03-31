/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        nexum: {
          50:  '#eff6ff',
          100: '#dbeafe',
          400: '#60a5fa',
          500: '#5b8def',
          600: '#4a7de0',
          700: '#3b6fd4',
          900: '#1e3a6e',
        },
        surface: {
          DEFAULT: '#111111',
          2: '#161616',
          3: '#1a1a1a',
          4: '#222222',
        },
        border: {
          DEFAULT: '#2a2a2a',
          subtle: '#1e1e1e',
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'bounce-slow': 'bounce 1.5s infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
    },
  },
  plugins: [],
}
