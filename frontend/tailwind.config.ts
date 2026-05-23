import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f7f8",
          100: "#eeeef0",
          200: "#d8d8dd",
          300: "#b3b3bc",
          400: "#838391",
          500: "#5d5d6b",
          600: "#43434f",
          700: "#34343e",
          800: "#21212a",
          900: "#13131a",
        },
        accent: {
          DEFAULT: "#7c5cff",
          soft: "#efeaff",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Inter", "Segoe UI", "Helvetica", "Arial"],
      },
    },
  },
  plugins: [],
};
export default config;
