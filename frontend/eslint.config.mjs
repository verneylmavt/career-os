import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // Keep legacy catch annotations visible until the page cleanup.
      "@typescript-eslint/no-explicit-any": "warn",
      // Existing text content is safe JSX; normalize its escaping in page cleanup.
      "react/no-unescaped-entities": "warn",
      // Surface existing load-on-mount patterns while the pages are migrated.
      "react-hooks/set-state-in-effect": "warn",
      // Manual memoization preservation is a React Compiler optimization check.
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
