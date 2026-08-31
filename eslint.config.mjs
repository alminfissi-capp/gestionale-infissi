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
    // Non e' codice nostro: `pdf.worker.min.mjs` e' la libreria pdf.js copiata
    // dentro public/, `sw.js` lo rigenera Serwist a ogni build (ed e' gitignorato).
    // Lintarli produceva 1647 problemi su 1743, seppellendo quelli veri.
    "public/**",
  ]),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
]);

export default eslintConfig;
