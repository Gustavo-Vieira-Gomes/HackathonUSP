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
