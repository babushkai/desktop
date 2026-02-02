/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Background colors - layered depth
        background: {
          DEFAULT: "#0a0a0f",      // Canvas (darkest)
          surface: "#0f172a",      // General surface
          elevated: "#1e293b",     // Hover/active states
          toolbar: "#101829",      // Top bar - slightly lighter
          sidebar: "#0d1424",      // Side panels - medium navy
          footer: "#0c1220",       // Bottom panel - deep navy
        },
        // Log panel colors (GitHub dark theme)
        log: {
          bg: "var(--log-bg)",
          text: "var(--log-text)",
          muted: "var(--log-muted)",
          error: "var(--log-error)",
          success: "var(--log-success)",
          info: "var(--log-info)",
        },
        // Accent colors
        accent: {
          DEFAULT: "#22d3ee",
          secondary: "#14b8a6",
          glow: "rgba(34, 211, 238, 0.15)",
        },
        // Text colors
        text: {
          primary: "#f8fafc",
          secondary: "#94a3b8",
          muted: "#64748b",
        },
        // Status colors
        state: {
          success: "#4ade80",
          error: "#f87171",
          warning: "#fbbf24",
          running: "#fbbf24",
        },
        // Node type colors
        node: {
          dataloader: "#34d399",
          datasplit: "#e879f9",
          trainer: "#a78bfa",
          evaluator: "#fb923c",
          exporter: "#2dd4bf",
          script: "#38bdf8",
        },
      },
      borderRadius: {
        sm: "0.5rem",
        DEFAULT: "0.75rem",
        lg: "1rem",
      },
      boxShadow: {
        glow: "0 4px 24px rgba(34, 211, 238, 0.1)",
        "glow-sm": "0 2px 12px rgba(34, 211, 238, 0.08)",
        "panel-r": "2px 0 8px -2px rgba(0, 0, 0, 0.4)",
        "panel-l": "-2px 0 8px -2px rgba(0, 0, 0, 0.4)",
        "panel-t": "0 -2px 8px -2px rgba(0, 0, 0, 0.4)",
        "panel-b": "0 2px 8px -2px rgba(0, 0, 0, 0.4)",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-in": "fade-in 200ms ease-out",
        "slide-in-right": "slide-in-right 200ms ease-out",
        "slide-up": "slide-up 200ms ease-out",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 8px var(--tw-shadow-color)" },
          "50%": { boxShadow: "0 0 20px var(--tw-shadow-color)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
