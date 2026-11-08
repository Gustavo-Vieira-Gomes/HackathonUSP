import { Injectable, type PipeTransform } from '@nestjs/common';
import type { z, ZodType } from 'zod';
import { ApiException } from '../api-errors';

/** Valida o body com um schema do pacote de contratos; falha vira `400 validation_failed`. */
@Injectable()
export class ZodValidationPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fields = result.error.issues.map((issue) =>
      issue.path.length > 0 ? String(issue.path[0]) : 'body',
    );
    throw new ApiException('validation_failed', [...new Set(fields)]);
  }
}
