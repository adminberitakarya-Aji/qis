/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        pitch: {
          bg: '#000000',
          dark: '#050505',
          surface: '#09090b',
          card: '#121215',
          hover: '#1a1a1e',
          border: '#27272a',
          borderLight: '#3f3f46',
        },
        electric: {
          blue: '#3b82f6',
          light: '#60a5fa',
          glow: 'rgba(59, 130, 246, 0.2)',
        },
        neon: {
          purple: '#c084fc',
          glow: 'rgba(192, 132, 252, 0.2)',
        },
        emerald: {
          profit: '#10b981',
          glow: 'rgba(16, 185, 129, 0.2)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
