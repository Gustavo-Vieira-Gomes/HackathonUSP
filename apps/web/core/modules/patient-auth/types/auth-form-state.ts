export type AuthField = 'name' | 'email' | 'phone' | 'password' | 'consent';

export interface AuthFormState {
  /** Mensagem do formulário inteiro, lida por leitores de tela. */
  message?: string;
  messageLink?: { href: string; label: string };
  fieldErrors?: Partial<Record<AuthField, string>>;
  /** Valores reexibidos após erro; a senha nunca volta. */
  values?: { name?: string; email?: string; phone?: string };
}

export const AUTH_FIELD_ORDER: AuthField[] = [
  'name',
  'email',
  'phone',
  'password',
  'consent',
];
