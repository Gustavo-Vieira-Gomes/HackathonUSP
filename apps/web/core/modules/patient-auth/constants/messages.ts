import type { AuthField } from '../types/auth-form-state';

export const UNAVAILABLE_MESSAGE =
  'Não foi possível concluir agora. Tente novamente em instantes.';
export const CONSENT_REQUIRED_MESSAGE =
  'O consentimento para dados de saúde é obrigatório.';
export const EMAIL_IN_USE_MESSAGE = 'Este e-mail já está cadastrado.';
export const INVALID_CREDENTIALS_MESSAGE = 'E-mail ou senha incorretos.';
export const RATE_LIMITED_MESSAGE =
  'Muitas tentativas. Aguarde um minuto e tente novamente.';

export const SIGN_UP_FIELD_MESSAGES: Record<AuthField, string> = {
  name: 'Informe o nome completo, de 2 a 120 caracteres.',
  email: 'Informe um e-mail válido.',
  phone: 'Informe o telefone com DDD, 10 ou 11 dígitos.',
  password: 'A senha deve ter de 8 a 128 caracteres.',
  consent: CONSENT_REQUIRED_MESSAGE,
};

export const SIGN_IN_FIELD_MESSAGES: Partial<Record<AuthField, string>> = {
  email: 'Informe um e-mail válido.',
  password: 'Informe a senha.',
};
