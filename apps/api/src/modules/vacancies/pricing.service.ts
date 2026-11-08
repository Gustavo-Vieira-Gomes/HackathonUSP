import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { localDayStart } from './matching-rules';
import { currentPriceCents } from './price-engine';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Estados em que o preço ainda importa: a vaga está à venda (RN-24). */
const ON_SALE = ['publicada', 'alertando'] as const;

const examPricing = {
  fullPriceCents: true,
  floorPriceCents: true,
  priceSteps: { select: { leadMinutes: true, discountPercent: true } },
} as const;

type ExamPricing = {
  fullPriceCents: number;
  floorPriceCents: number;
  priceSteps: { leadMinutes: number; discountPercent: number }[];
};

function priceAt(exam: ExamPricing, startsAt: Date, now: Date): number {
  return currentPriceCents({
    fullPriceCents: exam.fullPriceCents,
    floorPriceCents: exam.floorPriceCents,
    steps: exam.priceSteps,
    minutesUntilStart: (startsAt.getTime() - now.getTime()) / MINUTE_MS,
  });
}

export interface PriceChange {
  vacancyId: string;
  priceCents: number;
}

/**
 * Dono do preço da vaga no tempo (RN-26 a RN-28). A conta é a função pura de
 * `price-engine.ts`; aqui ficam a leitura do banco, a gravação e o aviso em tempo
 * real. Todo `now` vem do `ClockService`, passado por quem chama.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Preço com que a vaga nasce: o do degrau atual (F6, "Publicar horário vazio"). */
  async initialPriceCents(slotId: string, now: Date): Promise<number> {
    const slot = await this.prisma.slot.findUniqueOrThrow({
      where: { id: slotId },
      select: { startsAt: true, exam: { select: examPricing } },
    });
    return priceAt(slot.exam, slot.startsAt, now);
  }

  /**
   * Recalcula o preço das vagas à venda e avisa quem está na página da vaga. Chamado
   * a cada minuto pelo cron (HACK-32). O preço só desce: a gravação é condicional a
   * um valor maior, então duas execuções concorrentes não sobem nem duplicam aviso.
   */
  async recalculatePrices(now: Date): Promise<PriceChange[]> {
    const vacancies = await this.prisma.vacancy.findMany({
      where: { state: { in: [...ON_SALE] }, slot: { startsAt: { gt: now } } },
      select: {
        id: true,
        currentPriceCents: true,
        slot: { select: { startsAt: true, exam: { select: examPricing } } },
      },
    });
    const changes: PriceChange[] = [];
    for (const vacancy of vacancies) {
      const price = priceAt(vacancy.slot.exam, vacancy.slot.startsAt, now);
      if (price >= vacancy.currentPriceCents) continue;
      const updated = await this.prisma.vacancy.updateMany({
        where: {
          id: vacancy.id,
          state: { in: [...ON_SALE] },
          currentPriceCents: { gt: price },
        },
        data: { currentPriceCents: price },
      });
      if (updated.count === 0) continue;
      changes.push({ vacancyId: vacancy.id, priceCents: price });
      this.realtime.vagaPreco({ vagaId: vacancy.id, precoCentavos: price });
    }
    return changes;
  }

  /**
   * Teto diário de vagas com desconto por clínica (RN-28). Conta as vagas que a
   * clínica publicou no dia local (America/Sao_Paulo) e recusa com 422 quando o
   * teto foi atingido. A publicação (HACK-20) chama antes de
   * `VacanciesService.publish`, na mesma transação. Toda vaga de encaixe conta,
   * porque todas descem de preço.
   *
   * `publishedAt` é o relógio real, não o da demo: `Vacancy.createdAt` é gravado
   * pelo banco em tempo real, e adiantar o relógio não pode mudar o dia contado.
   */
  async assertDailyDiscountCap(
    clinicId: string,
    db: Prisma.TransactionClient = this.prisma,
    publishedAt: Date = new Date(),
  ): Promise<void> {
    const clinic = await db.clinic.findUniqueOrThrow({
      where: { id: clinicId },
      select: { dailyDiscountCap: true },
    });
    const dayStart = localDayStart(publishedAt);
    const published = await db.vacancy.count({
      where: {
        slot: { clinicId },
        createdAt: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY_MS) },
      },
    });
    if (published >= clinic.dailyDiscountCap) {
      throw new UnprocessableEntityException({
        code: 'DAILY_DISCOUNT_CAP',
        message: `A clínica já publicou ${clinic.dailyDiscountCap} vagas com desconto hoje, o teto diário.`,
        cap: clinic.dailyDiscountCap,
      });
    }
  }
}
