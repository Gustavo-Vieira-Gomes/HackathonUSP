/** Degrau de preço (RN-26): desconto aplicado quando faltam `leadMinutes` ou menos para o horário. */
export interface PriceStep {
  leadMinutes: number;
  discountPercent: number;
}

export interface CurrentPriceInput {
  fullPriceCents: number;
  floorPriceCents: number;
  steps: readonly PriceStep[];
  /** Minutos até o início do horário; zero ou negativo quando já começou. */
  minutesUntilStart: number;
}

/**
 * Preço do momento da vaga, em centavos inteiros (RN-26 a RN-27).
 *
 * Vale o maior desconto entre os degraus já alcançados, então o preço só desce
 * com o passar do tempo, mesmo que a clínica configure descontos fora de ordem.
 * O resultado nunca fica abaixo do piso nem acima do preço cheio.
 */
export function currentPriceCents({
  fullPriceCents,
  floorPriceCents,
  steps,
  minutesUntilStart,
}: CurrentPriceInput): number {
  const discountPercent = steps.reduce(
    (best, step) =>
      minutesUntilStart <= step.leadMinutes
        ? Math.max(best, step.discountPercent)
        : best,
    0,
  );
  const discounted = Math.round(
    (fullPriceCents * (100 - Math.min(discountPercent, 100))) / 100,
  );
  return Math.min(fullPriceCents, Math.max(floorPriceCents, discounted));
}
