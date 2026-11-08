import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { STALE_PENDING_MS } from '../notifications/notifications.service';
import { matchesVacancy, type MatchableVacancy } from './matching-rules';

/** Estados de vaga que ainda aceitam candidatos (RN-24). */
const OPEN_STATES = ['publicada', 'alertando'] as const;

type VacancyWithSlot = {
  currentPriceCents: number;
  slot: {
    startsAt: Date;
    endsAt: Date;
    clinic: { latitude: number; longitude: number };
    exam: { minLeadMinutes: number; preparationHours: number };
  };
};

function toMatchable(vacancy: VacancyWithSlot): MatchableVacancy {
  const { slot } = vacancy;
  return {
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    currentPriceCents: vacancy.currentPriceCents,
    clinic: slot.clinic,
    requiredLeadMinutes: Math.max(
      slot.exam.minLeadMinutes,
      slot.exam.preparationHours * 60,
    ),
  };
}

const slotInclude = {
  slot: {
    select: {
      startsAt: true,
      endsAt: true,
      exam: {
        select: {
          tussCode: true,
          minLeadMinutes: true,
          preparationHours: true,
        },
      },
      clinic: { select: { latitude: true, longitude: true } },
    },
  },
} as const;

/**
 * Compatibilidade entre vagas de encaixe e inscrições (RN-19, RN-21, RN-23, RN-36).
 * As regras ficam em `matching-rules.ts`; aqui só a consulta. Filtra no código em
 * vez de SQL porque o volume do piloto é pequeno e assim as regras têm teste sem banco.
 */
@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inscrições ativas candidatas à vaga, da mais antiga para a mais nova. Quem já
   * tem `Alert` desta vaga, em qualquer canal ou onda, fica de fora: assim a próxima
   * onda pega os seguintes da fila em vez de repetir os primeiros (RN-34, RN-36).
   *
   * Exceção: um `Alert` pendente há mais de STALE_PENDING_MS foi abandonado por um
   * processo que caiu entre gravar e enviar. Esse não conta, para que a inscrição
   * volte e o `NotificationsService` reivindique e reenvie o alerta (HACK-45).
   * A idade usa o relógio real, não `now`: mede a queda do processo, não o tempo
   * do negócio, e é o mesmo critério que a reivindicação usa.
   */
  async candidatos(vacancyId: string, now: Date) {
    const vacancy = await this.prisma.vacancy.findUniqueOrThrow({
      where: { id: vacancyId },
      include: slotInclude,
    });
    const matchable = toMatchable(vacancy);
    const staleBefore = new Date(Date.now() - STALE_PENDING_MS);
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        tussCode: vacancy.slot.exam.tussCode,
        expiresAt: { gt: now },
        alerts: {
          none: {
            vacancyId,
            OR: [
              { result: { not: 'pendente' } },
              { createdAt: { gte: staleBefore } },
            ],
          },
        },
      },
      include: { windows: true },
      orderBy: { createdAt: 'asc' },
    });
    const seenPatients = new Set<string>();
    return subscriptions.filter((subscription) => {
      if (seenPatients.has(subscription.patientId)) return false;
      if (!matchesVacancy(subscription, matchable, now)) return false;
      seenPatients.add(subscription.patientId);
      return true;
    });
  }

  /** Vagas abertas que já servem a uma inscrição recém-criada (RN-19). */
  async vagasCompativeis(subscriptionId: string, now: Date) {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      include: { windows: true },
    });
    const vacancies = await this.prisma.vacancy.findMany({
      where: {
        state: { in: [...OPEN_STATES] },
        slot: { exam: { tussCode: subscription.tussCode } },
      },
      include: slotInclude,
      orderBy: { createdAt: 'asc' },
    });
    return vacancies.filter((vacancy) =>
      matchesVacancy(subscription, toMatchable(vacancy), now),
    );
  }
}
