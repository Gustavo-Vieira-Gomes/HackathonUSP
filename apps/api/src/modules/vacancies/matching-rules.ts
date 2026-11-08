const EARTH_RADIUS_METERS = 6_371_000;
const CLINIC_TIME_ZONE = 'America/Sao_Paulo';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface AvailabilityWindow {
  /** 0 = domingo ... 6 = sábado, no fuso America/Sao_Paulo. */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface MatchableSubscription {
  maxPriceCents: number;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  windows: readonly AvailabilityWindow[];
}

export interface MatchableVacancy {
  startsAt: Date;
  endsAt: Date;
  currentPriceCents: number;
  clinic: GeoPoint;
  /** Antecedência exigida: o maior entre a mínima do exame e o preparo (RN-23). */
  requiredLeadMinutes: number;
}

/** Distância em metros pela fórmula de haversine. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const localParts = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Dia da semana e minuto do dia de um instante, no fuso da clínica. */
export function localWeekdayAndMinute(at: Date): {
  weekday: number;
  minute: number;
} {
  const parts = Object.fromEntries(
    localParts.formatToParts(at).map((p) => [p.type, p.value]),
  );
  return {
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ''),
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * O horário inteiro, do início ao fim, cabe em alguma janela da inscrição (RN-21).
 * O fim é medido a partir do início no mesmo dia local: um exame que atravessa a
 * meia-noite passa de 1440 e não cabe em janela nenhuma.
 */
export function isInsideWindow(
  startsAt: Date,
  endsAt: Date,
  windows: readonly AvailabilityWindow[],
): boolean {
  const { weekday, minute: start } = localWeekdayAndMinute(startsAt);
  const end = start + (endsAt.getTime() - startsAt.getTime()) / 60_000;
  return windows.some(
    (w) =>
      w.weekday === weekday && start >= w.startMinute && end <= w.endMinute,
  );
}

/**
 * Regras de compatibilidade entre vaga e inscrição (RN-19, RN-21, RN-23). O TUSS
 * e a validade da inscrição são filtrados na consulta, que não traz as demais.
 */
export function matchesVacancy(
  subscription: MatchableSubscription,
  vacancy: MatchableVacancy,
  now: Date,
): boolean {
  const leadMinutes = (vacancy.startsAt.getTime() - now.getTime()) / 60_000;
  return (
    leadMinutes >= vacancy.requiredLeadMinutes &&
    vacancy.currentPriceCents <= subscription.maxPriceCents &&
    haversineMeters(subscription, vacancy.clinic) <=
      subscription.radiusMeters &&
    isInsideWindow(vacancy.startsAt, vacancy.endsAt, subscription.windows)
  );
}
