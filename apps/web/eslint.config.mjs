import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@hackathon/api',
            '@hackathon/api/*',
            '**/apps/api/**',
            '**/api/src/**',
            '@nestjs/*',
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts']),
]);
