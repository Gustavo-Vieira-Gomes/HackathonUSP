import {
  type PipeTransform,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { z } from 'zod';

/**
 * Valida o corpo com um schema dos contratos (HACK-16, porta 3). Falha → 422
 * `{ code: 'VALIDATION_FAILED', message, fields }`, com `fields` = caminhos únicos
 * das issues (`cnes`, `openingHours.0.endMinute`…); corpo ausente ou que não é
 * objeto → `fields: ['body']`. Erro de campo de regra (CNES repetido, endereço não
 * achado) usa o mesmo corpo com outro `code`: ver `fieldError`.
 *
 * Uso: `@Body(new ZodBodyPipe(schema)) body: z.infer<typeof schema>`.
 */
export class ZodBodyPipe<T extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<T>
> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw invalid(['body']);
    }
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw invalid([...new Set(parsed.error.issues.flatMap(issuePaths))]);
  }
}

/** Campo extra (`unrecognized_keys`) vem no `keys` da issue, não no caminho. */
function issuePaths(issue: z.core.$ZodIssue): string[] {
  const paths =
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => [...issue.path, key])
      : [issue.path];
  return paths.map((path) => path.join('.') || 'body');
}

function invalid(fields: string[]): UnprocessableEntityException {
  return fieldError(
    'VALIDATION_FAILED',
    'Campos inválidos ou ausentes.',
    fields,
  );
}

/** 422 de campo no formato da porta 3, para erro de regra com campo. */
export function fieldError(
  code: string,
  message: string,
  fields: string[],
): UnprocessableEntityException {
  return new UnprocessableEntityException({ code, message, fields });
}
