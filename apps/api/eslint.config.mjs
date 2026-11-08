import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.test-dist/**',
      'node_modules/**',
      'src/generated/**',
    ],
  },
  js.configs.recommended,
  {
    // Scripts de automação rodam em Node.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@hackathon/web',
            '@hackathon/web/*',
            '**/apps/web/**',
            '**/web/src/**',
            'next',
            'next/*',
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
