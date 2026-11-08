import type { ClinicOpeningHours } from '@hackathon/contracts';

/** Dias do formulário, de domingo (0) a sábado (6), como `weekday` da API. */
export const WEEKDAYS = [
  { weekday: 0, label: 'Domingo' },
  { weekday: 1, label: 'Segunda-feira' },
  { weekday: 2, label: 'Terça-feira' },
  { weekday: 3, label: 'Quarta-feira' },
  { weekday: 4, label: 'Quinta-feira' },
  { weekday: 5, label: 'Sexta-feira' },
  { weekday: 6, label: 'Sábado' },
] as const;

export interface DayForm {
  weekday: number;
  closed: boolean;
  /** `HH:MM`, hora de São Paulo (a clínica digita a hora local dela). */
  open: string;
  close: string;
}

/**
 * `HH:MM` → minutos do dia. Conta direto pelo texto, sem `Date`, para o fuso do
 * servidor ou do navegador não deslocar o expediente. Inválido → `NaN` (a API recusa).
 */
export function toMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutos do dia → `HH:MM`; 1440 vira `24:00`. */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** Faixas enviadas à API: uma por dia aberto, na ordem dos dias. */
export function toOpeningHours(days: DayForm[]): ClinicOpeningHours[] {
  return days
    .filter((day) => !day.closed)
    .map((day) => ({
      weekday: day.weekday,
      startMinute: toMinutes(day.open),
      endMinute: toMinutes(day.close),
    }));
}
