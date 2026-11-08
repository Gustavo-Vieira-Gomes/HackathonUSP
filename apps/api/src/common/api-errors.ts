import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiError, ApiErrorCode } from '@hackathon/contracts';

/** Mensagem pública padrão de cada código (AD-004). Texto seguro para exibir. */
export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  validation_failed: 'Dados inválidos.',
  invalid_credentials: 'E-mail ou senha incorretos.',
  unauthenticated: 'Sessão ausente ou expirada.',
  not_found: 'Recurso não encontrado.',
  email_in_use: 'Este e-mail já está cadastrado.',
  payload_too_large: 'Requisição grande demais.',
  consent_required: 'O consentimento para dados de saúde é obrigatório.',
  rate_limited: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
  internal_error: 'Erro interno.',
  service_unavailable:
    'Serviço indisponível no momento. Tente novamente em instantes.',
};

const STATUS_BY_CODE: Record<ApiErrorCode, HttpStatus> = {
  validation_failed: HttpStatus.BAD_REQUEST,
  invalid_credentials: HttpStatus.UNAUTHORIZED,
  unauthenticated: HttpStatus.UNAUTHORIZED,
  not_found: HttpStatus.NOT_FOUND,
  email_in_use: HttpStatus.CONFLICT,
  payload_too_large: HttpStatus.PAYLOAD_TOO_LARGE,
  consent_required: HttpStatus.UNPROCESSABLE_ENTITY,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  internal_error: HttpStatus.INTERNAL_SERVER_ERROR,
  service_unavailable: HttpStatus.SERVICE_UNAVAILABLE,
};

/** Exceção HTTP cujo corpo já está no formato do contrato de erro. */
export class ApiException extends HttpException {
  constructor(code: ApiErrorCode, fields?: string[]) {
    const body: ApiError = { code, message: API_ERROR_MESSAGES[code] };
    if (fields) body.fields = fields;
    super(body, STATUS_BY_CODE[code]);
  }
}
