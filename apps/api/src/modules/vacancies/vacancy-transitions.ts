import type { VacancyState } from '../../generated/prisma/client';

/**
 * Tabela de transições da vaga: fonte única da RN-24 no código (HACK-29, porta 3).
 * Cada linha cita a aresta da «Tabela de transições» do plano. A criação
 * (nenhum → publicada, T1) é o `publish` do serviço e não entra aqui.
 * Terminais (realizada, expirada, cancelada) não têm saída.
 */
export const VACANCY_TRANSITIONS: Readonly<
  Record<VacancyState, readonly VacancyState[]>
> = {
  // T2 onda, T5 reserva direta (RN-19), T8 expira, T12 cancelada pela clínica/agenda.
  publicada: ['alertando', 'reservada', 'expirada', 'cancelada'],
  // T3 próxima onda, T4 esgotou inscrições (RN-34), T6 reserva, T8 expira, T12.
  alertando: ['alertando', 'publicada', 'reservada', 'expirada', 'cancelada'],
  // T7 realizada, T9 volta a publicada (D2), T10 cancelada (D2-D4), T11 volta às ondas (D3).
  reservada: ['realizada', 'publicada', 'cancelada', 'alertando'],
  realizada: [],
  expirada: [],
  cancelada: [],
};

export function canTransition(from: VacancyState, to: VacancyState): boolean {
  return VACANCY_TRANSITIONS[from].includes(to);
}
