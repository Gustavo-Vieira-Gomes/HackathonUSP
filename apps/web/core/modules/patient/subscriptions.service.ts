import 'server-only';
import { subscriptionListSchema } from '@hackathon/contracts';
import {
  apiBaseUrl,
  type ApiCallOptions,
} from '@/core/shared/services/api-proxy.service';

export async function getPatientSubscriptions(
  cookie: string,
  options: ApiCallOptions = {},
) {
  try {
    const response = await fetch(
      new URL('/api/patient/subscriptions', options.baseUrl ?? apiBaseUrl()),
      {
        headers: { cookie },
        cache: 'no-store',
        signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
      },
    );
    if (response.status === 401) return { kind: 'unauthenticated' } as const;
    if (!response.ok) return { kind: 'error' } as const;
    const parsed = subscriptionListSchema.safeParse(await response.json());
    return parsed.success
      ? ({ kind: 'ok', subscriptions: parsed.data.subscriptions } as const)
      : ({ kind: 'error' } as const);
  } catch {
    return { kind: 'error' } as const;
  }
}
