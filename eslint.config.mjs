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
    // `<Image>` di @react-pdf/renderer disegna dentro un PDF, non nel DOM: non
    // ha un prop `alt` e non c'e' niente da leggere a uno screen reader. La
    // regola jsx-a11y lo scambia per un <img> del browser.
    files: ['**/*PdfDocument.tsx', 'components/produzione/OrdinePDF.tsx', 'lib/pdf/**'],
    rules: { 'jsx-a11y/alt-text': 'off' },
  },
  {
    rules: {
      // Le nostre <img> sono miniature di immagini caricate dagli utenti, servite
      // da URL firmati Supabase che scadono, o anteprime blob: locali. next/image
      // vorrebbe i domini remoti in configurazione e non puo' ottimizzare niente
      // su una miniatura da 32px: il costo c'e', il beneficio no.
      '@next/next/no-img-element': 'off',
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
