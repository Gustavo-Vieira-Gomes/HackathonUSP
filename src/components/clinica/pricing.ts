// Mesma escada do banco (price_step / vacancy_price_cents em supabase/migrations):
// cheio acima de 48 h; −10% até 24 h; −20% até 6 h; −30% depois. Nunca abaixo do piso.

export function priceStep(hoursLeft: number): number {
  return hoursLeft > 48 ? 0 : hoursLeft > 24 ? 1 : hoursLeft > 6 ? 2 : 3;
}

export function vacancyPriceCents(fullCents: number, floorCents: number, hoursLeft: number): number {
  return Math.max(floorCents, Math.round(fullCents * (1 - 0.1 * priceStep(hoursLeft))));
}

/** Desconto efetivo em pontos percentuais (o piso pode segurar o degrau). */
export function discountPct(fullCents: number, priceCents: number): number {
  if (fullCents <= 0) return 0;
  return Math.max(0, Math.round((1 - priceCents / fullCents) * 100));
}

/** "N h" ou "N min" para o tempo que falta. */
export function leftLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  return `${Math.floor(hours)} h`;
}
