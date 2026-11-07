import 'server-only';
import { healthResponseSchema } from '@hackathon/contracts';

export async function isApiAvailable(): Promise<boolean> {
  try {
    const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
    const response = await fetch(new URL('/api/health', baseUrl), {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) return false;
    const result = healthResponseSchema.safeParse(await response.json());
    return (
      result.success &&
      result.data.status === 'ok' &&
      result.data.service === 'api'
    );
  } catch {
    return false;
  }
}
