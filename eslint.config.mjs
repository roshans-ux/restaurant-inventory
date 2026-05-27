import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Fetch-on-mount via useEffect is the correct approach for client pages
      // that don't yet use a data-fetching library like SWR or React Query.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
