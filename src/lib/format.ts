// Datas sempre no calendário de São Paulo; dinheiro sempre em centavos.

export const TZ = "America/Sao_Paulo";

export function brl(cents: number, opts: { decimals?: boolean } = {}): string {
  const value = cents / 100;
  const decimals = opts.decimals ?? !Number.isInteger(value);
  return (
    "R$ " +
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    })
  );
}

/** "AAAA-MM-DD" do dia em São Paulo. */
export function spDay(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "HH:MM" em São Paulo. */
export function spTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** Minutos desde 00:00 em São Paulo. */
export function spMinutes(date: Date | string): number {
  const [h, m] = spTime(date).split(":").map(Number);
  return h * 60 + m;
}

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function dayParts(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  return { y, m, d, dow: utc.getUTCDay() };
}

export function addDays(day: string, n: number): string {
  const { y, m, d } = dayParts(day);
  const utc = new Date(Date.UTC(y, m - 1, d + n, 12));
  return utc.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const pa = dayParts(a);
  const pb = dayParts(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000);
}

/** "Hoje", "Amanhã" ou "Ter, 10/11". */
export function relDay(date: Date | string, now: Date = new Date()): string {
  const day = spDay(date);
  const diff = diffDays(day, spDay(now));
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  const { d, m, dow } = dayParts(day);
  return `${WEEKDAY_SHORT[dow]}, ${d}/${m}`;
}

/** "Terça, 10 de novembro". */
export function longDay(day: string): string {
  const { d, m, dow } = dayParts(day);
  return `${WEEKDAY_LONG[dow]}, ${d} de ${MONTHS[m - 1]}`;
}

/** "Novembro de 2026". */
export function monthTitle(day: string): string {
  const { y, m } = dayParts(day);
  const name = MONTHS[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
}

export function weekdayIndex(day: string): number {
  return dayParts(day).dow;
}

/** Instante (ISO) de um dia e hora de São Paulo. São Paulo não tem horário de verão desde 2019: UTC−3. */
export function spInstant(day: string, hhmm: string): string {
  return new Date(`${day}T${hhmm}:00-03:00`).toISOString();
}

export function hoursLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  return `${Math.floor(hours)} h`;
}
