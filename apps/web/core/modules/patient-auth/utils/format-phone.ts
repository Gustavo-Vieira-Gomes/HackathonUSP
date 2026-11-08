/** "+5511987654321" → "(11) 98765-4321"; outros formatos voltam como vieram. */
export function formatPhone(e164: string): string {
  const match = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : e164;
}
