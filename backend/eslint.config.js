import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // El backend es material didactico:Comments y mensajes explican el "por que".
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Los tests imprimen por consola a proposito (captura de logs).
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
