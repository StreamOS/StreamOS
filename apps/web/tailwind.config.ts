import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f3efff",
          500: "#9b5cff",
          700: "#6f36d8",
        },
        surface: {
          50: "#f8fafc",
          100: "#f1f5f9",
          800: "#171a23",
          900: "#11131a",
          950: "#090a0f",
        },
        signal: {
          green: "#00d4aa",
          red: "#ff4e6a",
          gold: "#f5c842",
          blue: "#48a4ff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
