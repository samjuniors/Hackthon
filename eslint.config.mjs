import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import hooksPlugin from "eslint-plugin-react-hooks";
import a11yPlugin from "eslint-plugin-jsx-a11y";

const __dirname = dirname(fileURLToPath(import.meta.url));

// FlatCompat bridges `eslint-config-next` (still eslintrc-format in v15) into
// flat config. Using the shared config rather than the bare plugin is what
// silences Next's "plugin was not detected in your ESLint configuration" warning.
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },

  ...compat.extends("next/core-web-vitals"),

  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": hooksPlugin,
      "jsx-a11y": a11yPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Previously registered but inert: no rule set was ever applied.
      ...hooksPlugin.configs["recommended-latest"].rules,
      ...a11yPlugin.flatConfigs.recommended.rules,

      // TypeScript correctness rules. `@typescript-eslint` was registered as a
      // plugin before this change but contributed zero rules.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-shadow": "error",

      // The decision engine must never silently swallow a failure.
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
    },
  },

  {
    // Node-side tooling: fixture capture writes progress to stdout by design.
    files: ["scripts/**/*.mjs", "*.config.{mjs,ts}", "e2e/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },

  {
    // Vendored shadcn/ui primitives are upstream code; we do not relint their
    // internal style choices, only keep them type-safe.
    files: ["src/components/ui/**"],
    rules: {
      "react-hooks/incompatible-library": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
