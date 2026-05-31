import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          500: "#2563eb",
          700: "#1d4ed8"
        },
        surface: {
          50: "#f8fafc",
          100: "#f1f5f9",
          900: "#0f172a"
        }
      }
    }
  },
  plugins: []
};

export default config;
