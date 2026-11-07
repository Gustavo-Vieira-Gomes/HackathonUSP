import { healthResponseSchema } from '@hackathon/contracts';

export function GET() {
  return Response.json(
    healthResponseSchema.parse({ status: 'ok', service: 'web' }),
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
