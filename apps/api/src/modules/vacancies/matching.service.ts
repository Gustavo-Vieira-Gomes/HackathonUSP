import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
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
 * Distância haversine em metros, em SQL, entre duas colunas/valores de lat/lng. A
 * mesma fórmula de `haversineMeters`, com o mesmo raio da Terra.
 */
function haversineSql(
  latA: Prisma.Sql,
  lngA: Prisma.Sql,
  latB: Prisma.Sql,
  lngB: Prisma.Sql,
): Prisma.Sql {
  return Prisma.sql`(2 * 6371000 * asin(sqrt(
    power(sin(radians(${latB} - ${latA}) / 2), 2) +
    cos(radians(${latA})) * cos(radians(${latB})) *
    power(sin(radians(${lngB} - ${lngA}) / 2), 2)
  )))`;
}

/**
 * Compatibilidade entre vagas de encaixe e inscrições (RN-19, RN-21, RN-23, RN-36).
 * O raio é filtrado no banco (haversine em SQL), para não trazer inscrições da
 * cidade inteira; janela, preço e antecedência ficam em `matching-rules.ts`, que
 * também confere a distância e é a regra usada fora do banco (no-show, HACK-33).
 */
@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inscrições ativas candidatas à vaga, da mais antiga para a mais nova. Quem já
   * tem `Alert` desta vaga, em qualquer canal ou onda, fica de fora: assim a próxima
   * onda pega os seguintes da fila em vez de repetir os primeiros (RN-34, RN-36).
   *
   * Inclui `Alert` com `sem_canal`: canal ativo sem como enviar também conta como
   * alertado, para o paciente não voltar em toda onda (HACK-48).
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
    const { latitude, longitude } = vacancy.slot.clinic;
    const inRadius = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT s."id" FROM "Subscription" s
      WHERE s."tussCode" = ${vacancy.slot.exam.tussCode}
        AND s."expiresAt" > ${now}
        AND ${haversineSql(
          Prisma.sql`s."latitude"`,
          Prisma.sql`s."longitude"`,
          Prisma.sql`${latitude}::float8`,
          Prisma.sql`${longitude}::float8`,
        )} <= s."radiusMeters"`;
    const staleBefore = new Date(Date.now() - STALE_PENDING_MS);
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        id: { in: inRadius.map((row) => row.id) },
        tussCode: vacancy.slot.exam.tussCode,
        expiresAt: { gt: now },
        // Sem nenhum canal ativo não há como alertar nem onde gravar o Alert que
        // tira o paciente da fila; ele fica fora da onda (HACK-48).
        patient: { alertChannels: { isEmpty: false } },
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
    const inRadius = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT v."id" FROM "Vacancy" v
      JOIN "Slot" sl ON sl."id" = v."slotId"
      JOIN "Exam" e ON e."id" = sl."examId"
      JOIN "Clinic" c ON c."id" = sl."clinicId"
      WHERE e."tussCode" = ${subscription.tussCode}
        AND v."state"::text IN (${Prisma.join([...OPEN_STATES])})
        AND ${haversineSql(
          Prisma.sql`${subscription.latitude}::float8`,
          Prisma.sql`${subscription.longitude}::float8`,
          Prisma.sql`c."latitude"`,
          Prisma.sql`c."longitude"`,
        )} <= ${subscription.radiusMeters}`;
    const vacancies = await this.prisma.vacancy.findMany({
      where: {
        id: { in: inRadius.map((row) => row.id) },
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
