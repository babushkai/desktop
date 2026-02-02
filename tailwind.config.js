/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Background colors - base tokens (depth via CSS panel classes)
        background: {
          DEFAULT: "var(--surface-0)",
          surface: "var(--surface-2)",
          elevated: "var(--surface-4)",
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
          hover: "#2ee8f8",
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
          error: "#ef4444",
          errorHover: "#f87171",
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
      opacity: {
        15: "0.15",
      },
      boxShadow: {
        glow: "0 4px 24px rgba(34, 211, 238, 0.1)",
        "glow-sm": "0 2px 12px rgba(34, 211, 238, 0.08)",
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
