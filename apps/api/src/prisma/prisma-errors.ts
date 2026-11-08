/** Violação de unicidade do Prisma (`P2002`), venha do client ou do adapter. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
