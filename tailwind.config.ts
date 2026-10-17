import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        background: "#0d0f14",
        surface: "#131722",
        "surface-card": "#181d2c",
        "surface-elevated": "#1e2436",
        primary: {
          DEFAULT: "#6366f1",
          hover: "#4f46e5",
          light: "#818cf8",
        },
        accent: {
          DEFAULT: "var(--accent-color, #10b981)",
          hover: "var(--accent-color, #059669)",
        },
        danger: {
          DEFAULT: "#ef4444",
          hover: "#dc2626",
        },
        text: {
          primary: "#f8fafc",
          secondary: "#94a3b8",
          muted: "#64748b",
        },
        border: "rgba(255, 255, 255, 0.08)",
        "glass-bg": "rgba(19, 23, 34, 0.75)",
        "glass-card": "rgba(24, 29, 44, 0.65)",
        "glass-border": "rgba(255, 255, 255, 0.1)",
      },
      backdropBlur: {
        xs: "2px",
        glass: "16px",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        glow: "0 0 20px rgba(99, 102, 241, 0.35)",
        "glow-accent": "0 0 20px var(--accent-glow, rgba(16, 185, 129, 0.35))",
      },
    },
  },
  plugins: [],
} satisfies Config;
