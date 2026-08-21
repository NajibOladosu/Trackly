import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "extension/**",
      "supabase/functions/**",
      "coverage/**",
      "public/**/*.min.*",
    ],
  },
  {
    files: ["app/api/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/error-boundaries": "off",
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]
