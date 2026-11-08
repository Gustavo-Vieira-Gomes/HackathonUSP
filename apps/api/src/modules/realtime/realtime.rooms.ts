import type { SessionUser } from '@hackathon/contracts';

/** Máximo de salas de vaga por conexão (contém abuso de `vaga.assinar`). */
export const MAX_SALAS_DE_VAGA = 20;

const PREFIXO_VAGA = 'vaga:';

export function salaDaVaga(vagaId: string): string {
  return `${PREFIXO_VAGA}${vagaId}`;
}

/** Sala do paciente, chaveada pelo id de `User` (não `Patient.id`). */
export function salaDoPaciente(pacienteUserId: string): string {
  return `paciente:${pacienteUserId}`;
}

/** Sala da clínica, chaveada pelo id de `User` da conta (não `Clinic.id`). */
export function salaDaClinica(clinicaUserId: string): string {
  return `clinica:${clinicaUserId}`;
}

/**
 * Sala própria da conexão, derivada só da sessão e chaveada pelo id de `User`.
 * Os emissores resolvem o `User` a partir de `Patient`/`Clinic` (desvio M3).
 */
export function salaDoUsuario(user: SessionUser): string {
  return user.role === 'paciente'
    ? salaDoPaciente(user.id)
    : salaDaClinica(user.id);
}

export function contarSalasDeVaga(rooms: ReadonlySet<string>): number {
  let total = 0;
  for (const room of rooms) if (room.startsWith(PREFIXO_VAGA)) total++;
  return total;
}
