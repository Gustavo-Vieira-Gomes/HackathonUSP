import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
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
   * Publica dentro do teto diário de vagas com desconto da clínica (RN-28). Toda vaga
   * de encaixe conta, porque todas descem de preço; acima do teto, 422 com o teto.
   *
   * A contagem e a publicação rodam na mesma transação, com a linha da clínica
   * travada (`FOR UPDATE`) antes de contar. Sem a trava, duas publicações simultâneas
   * contariam o mesmo número em READ COMMITTED e as duas passariam (HACK-47). Com
   * ela, a segunda espera o commit da primeira e já conta a vaga nova.
   *
   * `publish` recebe a transação e deve criar a vaga nela, por exemplo com
   * `VacanciesService.publish(data, meta, tx)`. Quem já tem uma transação passa em
   * `options.tx`; a trava vale até o fim dela.
   *
   * `publishedAt` é o relógio real, não o da demo: `Vacancy.createdAt` é gravado
   * pelo banco em tempo real, e adiantar o relógio não pode mudar o dia contado.
   */
  async publishWithinDailyCap<T>(
    clinicId: string,
    publish: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { tx?: Prisma.TransactionClient; publishedAt?: Date } = {},
  ): Promise<T> {
    const run = async (tx: Prisma.TransactionClient) => {
      await this.lockClinic(tx, clinicId);
      await this.assertBelowCap(
        tx,
        clinicId,
        options.publishedAt ?? new Date(),
      );
      return publish(tx);
    };
    return options.tx ? run(options.tx) : this.prisma.$transaction(run);
  }

  private async lockClinic(
    tx: Prisma.TransactionClient,
    clinicId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Clinic" WHERE "id" = ${clinicId}::uuid FOR UPDATE`;
    if (rows.length === 0) {
      throw new NotFoundException('Clínica não encontrada.');
    }
  }

  private async assertBelowCap(
    tx: Prisma.TransactionClient,
    clinicId: string,
    publishedAt: Date,
  ): Promise<void> {
    const clinic = await tx.clinic.findUniqueOrThrow({
      where: { id: clinicId },
      select: { dailyDiscountCap: true },
    });
    const dayStart = localDayStart(publishedAt);
    const published = await tx.vacancy.count({
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
