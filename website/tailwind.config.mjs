// Import app config using createRequire for ESM/CJS compatibility
import { createRequire } from 'module';
import starlightPlugin from '@astrojs/starlight-tailwind';

const require = createRequire(import.meta.url);

// Kissaten AI theme - cyan/navy palette
const appColors = {
  background: {
    DEFAULT: 'var(--surface-0)',
    surface: 'var(--surface-2)',
    elevated: 'var(--surface-4)',
  },
  accent: {
    DEFAULT: '#22d3ee',
    secondary: '#14b8a6',
    glow: 'rgba(34, 211, 238, 0.15)',
  },
  text: {
    primary: '#f8fafc',
    secondary: '#94a3b8',
    muted: '#64748b',
  },
  state: {
    success: '#4ade80',
    error: '#f87171',
    warning: '#fbbf24',
  },
  node: {
    dataloader: '#3fb950',
    datasplit: '#a371f7',
    trainer: '#db61a2',
    evaluator: '#f0883e',
    exporter: '#79c0ff',
    script: '#58a6ff',
  },
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ...appColors,
        // Starlight accent colors (cyan-based)
        accent: {
          ...appColors.accent,
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },
        // Starlight gray scale (navy-based)
        gray: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#0b0e14',
        },
      },
      borderRadius: {
        sm: '0.5rem',
        DEFAULT: '0.75rem',
        lg: '1rem',
      },
      boxShadow: {
        glow: '0 4px 24px rgba(34, 211, 238, 0.1)',
        'glow-sm': '0 2px 12px rgba(34, 211, 238, 0.08)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px var(--tw-shadow-color)' },
          '50%': { boxShadow: '0 0 20px var(--tw-shadow-color)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [starlightPlugin()],
};
