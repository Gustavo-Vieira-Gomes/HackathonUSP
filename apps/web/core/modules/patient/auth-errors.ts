import { fieldErrorSchema } from '@hackathon/contracts';

export function patientAuthError(status: number, body: unknown): string {
  if (status === 429) return 'Muitas tentativas. Tente novamente em instantes.';
  const parsed = fieldErrorSchema.safeParse(body);
  if (parsed.success) {
    if (
      /CONSENT/i.test(parsed.data.code ?? '') ||
      parsed.data.fields?.includes('healthDataConsent')
    ) {
      return 'Consentimento obrigatório para criar sua conta.';
    }
    if (/EXIST/i.test(parsed.data.code ?? ''))
      return 'Já existe uma conta com este e-mail. Entre na sua conta.';
    if (status === 422)
      return parsed.data.message ?? 'Confira os dados informados.';
  }
  if (status === 400 || status === 401) return 'Confira seu e-mail e senha.';
  return 'Não foi possível concluir agora. Tente novamente em instantes.';
}
