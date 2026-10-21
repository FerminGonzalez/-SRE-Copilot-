import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "eslint.config.mjs"],
  },
  {
    files: ["**/*.ts", "**/*.mts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // Muchos métodos son `async` porque implementan una interfaz que exige
      // `Promise` (herramientas, handlers HTTP, proveedor de LLM), aunque en
      // la ruta offline no haya nada que esperar. La regla se desactiva para
      // no obligar a escribir `await Promise.resolve()` por estilo.
      "@typescript-eslint/require-await": "off",
      eqeqeq: ["error", "always"],
      "no-console": "off",
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
    },
  },
);
