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
    // Studio de cadres copié tel quel de Kalifun (lui-même repris de selfizee-booth-ui) : pas aux règles
    // de la Régie. src/studio/regie (le raccord avec la Régie) reste vérifié.
    "src/studio/api/**",
    "src/studio/app/**",
    "src/studio/components/**",
    "src/studio/lib/**",
    "src/app/editor-api/**",
  ]),
]);

export default eslintConfig;
