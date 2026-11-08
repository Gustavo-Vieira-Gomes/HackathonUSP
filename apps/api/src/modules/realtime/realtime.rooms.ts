import type { SessionUser } from '@hackathon/contracts';

/** Máximo de salas de vaga por conexão (contém abuso de `vaga.assinar`). */
export const MAX_SALAS_DE_VAGA = 20;

const PREFIXO_VAGA = 'vaga:';

export function salaDaVaga(vagaId: string): string {
  return `${PREFIXO_VAGA}${vagaId}`;
}

export function salaDoPaciente(pacienteId: string): string {
  return `paciente:${pacienteId}`;
}

export function salaDaClinica(clinicaId: string): string {
  return `clinica:${clinicaId}`;
}

/**
 * Sala própria da conexão, derivada só da sessão. Ponto único a trocar quando o
 * HACK-13 ligar o usuário clínica à entidade `Clinica` (porta 6).
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
