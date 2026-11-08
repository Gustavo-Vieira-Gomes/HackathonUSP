import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ApiErrorCode, apiErrorSchema } from '@hackathon/contracts';
import { API_ERROR_MESSAGES } from '../api-errors';
import type { ApiResponse } from '../http';

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'unauthenticated';
    case HttpStatus.NOT_FOUND:
      return 'not_found';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'payload_too_large';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'rate_limited';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'service_unavailable';
    default:
      return status >= 500 ? 'internal_error' : 'validation_failed';
  }
}

/**
 * Toda resposta de erro sai no formato `apiErrorSchema` (AD-004). Erros
 * inesperados viram 500 sem stack; o log registra só o nome do erro.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<ApiResponse>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = apiErrorSchema.safeParse(exception.getResponse());
      if (body.success) {
        response.status(status).json(body.data);
        return;
      }
      const code = codeForStatus(status);
      response.status(status).json({ code, message: API_ERROR_MESSAGES[code] });
      return;
    }

    const name = exception instanceof Error ? exception.name : typeof exception;
    this.logger.error(`Erro inesperado: ${name}.`);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'internal_error',
      message: API_ERROR_MESSAGES.internal_error,
    });
  }
}
