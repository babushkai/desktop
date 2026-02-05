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
          warning: "var(--log-warning)",
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
        // Node type colors (GitHub Dark theme)
        node: {
          dataloader: "#3fb950",  // GitHub green
          datasplit: "#a371f7",   // GitHub purple
          trainer: "#db61a2",     // GitHub pink
          evaluator: "#f0883e",   // GitHub orange
          exporter: "#79c0ff",    // GitHub light blue
          script: "#58a6ff",      // GitHub blue
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
