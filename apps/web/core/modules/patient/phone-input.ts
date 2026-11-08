/** Remove apenas formatação visual; caracteres inválidos seguem para validação. */
export function normalizePhoneInput(value: string): string {
  return value.replace(/[\s().-]/g, '');
}
