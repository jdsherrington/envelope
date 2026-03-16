import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Segoe UI", "Helvetica Neue", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "Menlo", "Consolas", "monospace"],
      },
      zIndex: {
        base: "1",
        nav: "20",
        overlay: "40",
        modal: "50",
      },
    },
  },
  plugins: [],
};

export default config;
