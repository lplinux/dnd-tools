/**
 * eslint.config.mjs — flat config, covering both halves of the repo.
 *
 * One install at the root rather than two: the backend is CommonJS (`app.js`
 * uses require) and the frontend is ESM with JSX, but flat config expresses both
 * in one file and avoids a second copy of eslint under frontend/.
 *
 * `.mjs` because the root package has no "type": "module".
 *
 * Rule levels are chosen so the first run is USEFUL rather than overwhelming:
 * rules that catch real defects are errors, judgement calls are warnings. See
 * the per-rule notes below.
 */

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'node_modules/**',
      'frontend/node_modules/**',
      'public/app/**',      // Vite build output
      'frontend/dist/**',
    ],
  },

  // ── Backend: CommonJS on Node ─────────────────────────────────────────────
  {
    files: ['app.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      // Callers routinely ignore a caught error's detail; flagging every one
      // would be noise without finding a defect.
      'no-unused-vars': ['error', {
        args: 'none',
        caughtErrors: 'none',
        // `const { a, b, ...rest } = obj` to strip keys is idiomatic; the
        // named siblings are unused ON PURPOSE.
        ignoreRestSiblings: true,
      }],
    },
  },

  // ── Frontend: ESM + JSX in the browser ────────────────────────────────────
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,

      // React 19's JSX transform — no React import needed.
      'react/react-in-jsx-scope': 'off',
      // There are no PropTypes anywhere here; leaving this on would bury
      // everything else under hundreds of findings.
      'react/prop-types': 'off',
      // Narrowed to the characters that genuinely break JSX. The default also
      // flags apostrophes in prose, which React renders correctly and which
      // accounted for every finding of this rule here.
      'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],

      // THE rule worth installing a linter for: it catches the conditional-hooks
      // class of bug that crashed the PC Sheet's relationship graph.
      'react-hooks/rules-of-hooks': 'error',
      // Warning, not error: eleven suppressions already exist in the source, and
      // each needs judgement — changing a dep array can cause refetch loops.
      'react-hooks/exhaustive-deps': 'warn',

      'no-unused-vars': ['error', {
        args: 'none',
        caughtErrors: 'none',
        // `const { a, b, ...rest } = obj` to strip keys is idiomatic; the
        // named siblings are unused ON PURPOSE.
        ignoreRestSiblings: true,
      }],
    },
  },

  // ── Config files themselves ───────────────────────────────────────────────
  {
    files: ['frontend/*.config.js', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node },
    rules: { ...js.configs.recommended.rules },
  },
];
