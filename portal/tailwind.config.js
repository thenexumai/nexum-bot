/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // NEXUM design system
        nx: {
          bg:        '#0a0a0a',
          surface:   '#111111',
          surface2:  '#1a1a1a',
          surface3:  '#222222',
          border:    '#2a2a2a',
          border2:   '#333333',
          text:      '#eeeeee',
          muted:     '#888888',
          faint:     '#555555',
          accent:    '#5b8def',
          accentHov: '#4a7de0',
          green:     '#22c55e',
          red:       '#ef4444',
          yellow:    '#eab308',
          purple:    '#a855f7',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right': 'slideInRight 0.3s cubic-bezier(0.16,1,0.3,1)',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'typing': 'typing 1.4s steps(3,end) infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        slideInRight: { from: { transform: 'translateX(16px)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        typing: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.2' } },
      },
    },
  },
  plugins: [],
}
