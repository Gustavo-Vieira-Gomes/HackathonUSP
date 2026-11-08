import type { Patient } from '@hackathon/contracts';

/** Partes da requisição Express usadas pela API. */
export interface ApiRequest {
  headers: { cookie?: string };
  body?: unknown;
  ip?: string;
  patient?: Patient;
}

/** Partes da resposta Express usadas pela API. */
export interface ApiResponse {
  append(field: string, value: string | string[]): unknown;
  status(code: number): ApiResponse;
  json(body: unknown): unknown;
}
