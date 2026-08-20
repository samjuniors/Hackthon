import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        thermal: {
          safe: "#10b981",
          caution: "#f59e0b",
          warning: "#f97316",
          critical: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};
export default config;
