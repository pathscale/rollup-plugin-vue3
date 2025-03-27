import js from "@eslint/js";
import n from "eslint-plugin-n";
import unicorn from "eslint-plugin-unicorn";
import importPlugin from "eslint-plugin-import";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import globals from "globals";
import jest from "eslint-plugin-jest";

// eslint-disable-next-line import/no-unresolved -- Bug: https://github.com/import-js/eslint-plugin-import/issues/1810
import tseslint from "typescript-eslint";

const extensions = [".mjs", ".js", ".json", ".ts", ".jsx", ".tsx"];

export default tseslint.config([
  {
    ignores: [
      "dist",
      "tmp",
      ".cache",
      ".vscode",
      "coverage",
      "docs",
      "__tests__/fixtures",
      ".eslintrc.js",
    ],
  },
  js.configs.recommended,
  n.configs["flat/recommended-module"],
  importPlugin.flatConfigs.errors,
  importPlugin.flatConfigs.warnings,
  unicorn.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es6,
      },
    },
    rules: {
      "unicorn/prefer-module": "off", // Reenable when supporting native ESM
      "no-await-in-loop": "error",
      "no-var": "error",
      "prefer-const": "error",
      "prefer-template": "error",
      "sort-vars": "error",
      "unicorn/no-null": "off",
      "unicorn/prefer-set-has": "off",
      "unicorn/prevent-abbreviations": "off",
      yoda: ["error", "never", { exceptRange: true }],
    },
    settings: { "import/resolver": { node: { extensions } }, node: { tryExtensions: extensions } },
  },
  ...[
    jest.configs["flat/recommended"],
    jest.configs["flat/style"],
    ...tseslint.configs.recommended,
  ].map(config => {
    return {
      ...config,
      files: ["__tests__/**/*.ts"],
      languageOptions: {
        parser: tseslint.parser,
        globals: {
          ...globals.jest,
        },
      },
    };
  }),
  ...[
    js.configs.recommended,
    n.configs["flat/recommended-module"],
    importPlugin.flatConfigs.errors,
    importPlugin.flatConfigs.warnings,
    importPlugin.flatConfigs.typescript,
    unicorn.configs.recommended,
    eslintConfigPrettier,
    ...tseslint.configs.recommended,
    tseslint.configs["recommended-requiring-type-checking"],
    {
      rules: {
        "unicorn/prefer-module": "off", // Reenable when supporting default native ESM
        "@typescript-eslint/default-param-last": "error",
        "@typescript-eslint/naming-convention": "error",
        "@typescript-eslint/prefer-for-of": "error",
        "@typescript-eslint/prefer-nullish-coalescing": "error",
        "@typescript-eslint/prefer-optional-chain": "error",
        "@typescript-eslint/prefer-readonly": "error",
        "@typescript-eslint/prefer-reduce-type-parameter": "error",
        "@typescript-eslint/prefer-ts-expect-error": "error",
        "@typescript-eslint/promise-function-async": "error",
        "@typescript-eslint/return-await": "error",
        "@typescript-eslint/unified-signatures": "error",
        "no-await-in-loop": "error",
        "prefer-template": "error",
        "sort-vars": "error",
        "unicorn/no-null": "off",
        "unicorn/prefer-set-has": "off",
        "unicorn/prevent-abbreviations": "off",
        yoda: ["error", "never", { exceptRange: true }],
      },
    },
  ].map(config => {
    return {
      ...config,
      files: ["src/**/*.ts"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          sourceType: "module",
          projectService: true,
          tsconfigRootDir: import.meta.dirname,
        },
        globals: {
          ...globals.node,
          ...globals.es6,
        },
      },
    };
  }),
]);
