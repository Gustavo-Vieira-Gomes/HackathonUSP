import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { matchesVacancy, type MatchableVacancy } from './matching-rules';

/** Estados de vaga que ainda aceitam candidatos (RN-24). */
const OPEN_STATES = ['publicada', 'alertando'] as const;

type VacancyWithSlot = {
  currentPriceCents: number;
  slot: {
    startsAt: Date;
    clinic: { latitude: number; longitude: number };
    exam: { minLeadMinutes: number; preparationHours: number };
  };
};

function toMatchable(vacancy: VacancyWithSlot): MatchableVacancy {
  const { slot } = vacancy;
  return {
    startsAt: slot.startsAt,
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

  /** Inscrições ativas candidatas à vaga, da mais antiga para a mais nova. */
  async candidatos(vacancyId: string, now: Date) {
    const vacancy = await this.prisma.vacancy.findUniqueOrThrow({
      where: { id: vacancyId },
      include: slotInclude,
    });
    const matchable = toMatchable(vacancy);
    const subscriptions = await this.prisma.subscription.findMany({
      where: { tussCode: vacancy.slot.exam.tussCode, expiresAt: { gt: now } },
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
