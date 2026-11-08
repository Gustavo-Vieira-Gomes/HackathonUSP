import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import type { NotificationMessage } from '../notifications/notification.types';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MatchingService } from './matching.service';
import { haversineMeters } from './matching-rules';
import { VacanciesService } from './vacancies.service';

const MINUTE_MS = 60_000;
const OPEN_STATES = ['publicada', 'alertando'] as const;
const EXHAUSTED_REASON = 'Inscrições compatíveis esgotadas';

type Candidate = Awaited<ReturnType<MatchingService['candidatos']>>[number];

/** Onda decidida e marcada na transação; o envio acontece depois do commit. */
interface Wave {
  vacancyId: string;
  number: number;
  /** N da clínica: quantos pacientes alcançados a onda precisa. */
  size: number;
  /** A fila inteira, em ordem; o envio para em N alcançados. */
  candidates: Candidate[];
  message: Omit<NotificationMessage, 'distanceMeters'>;
  clinic: { latitude: number; longitude: number };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}

/**
 * Ondas de alerta (RN-34, F9): a cada Z minutos, os N próximos candidatos da vaga
 * recebem o alerta. Só conta para N quem o `NotificationsService` alcançou por
 * algum canal; quem só tem canal sem adapter não conta e a onda segue a fila
 * (contorno do HACK-48: sem `Alert`, ele voltaria na onda seguinte e travaria a
 * fila). Uma onda por vez por vaga: a linha da vaga fica travada
 * (`FOR UPDATE SKIP LOCKED`) enquanto a onda é decidida e marcada com a
 * `Transition` para `alertando`; outro tick, ou a reserva, que a encontra travada
 * pula a vaga neste minuto. O envio roda depois do commit, para não segurar a trava
 * durante o tempo limite dos canais.
 */
@Injectable()
export class WavesService {
  private readonly logger = new Logger(WavesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vacancies: VacanciesService,
    private readonly matching: MatchingService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /** Dispara a onda devida de cada vaga aberta; a falha de uma não para as outras. */
  async dispatchDue(now: Date): Promise<void> {
    const open = await this.prisma.vacancy.findMany({
      where: {
        state: { in: [...OPEN_STATES] },
        slot: { startsAt: { gt: now } },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const { id } of open) {
      try {
        const wave = await this.markWave(id, now);
        if (wave) await this.send(wave);
      } catch (error) {
        // Só o id da vaga e a causa: contato e texto do alerta não vão para o log.
        this.logger.error(`Onda da vaga ${id} falhou: ${errorMessage(error)}`);
      }
    }
  }

  /**
   * Decide e grava a onda com a vaga travada. Devolve a onda a enviar, ou null
   * quando não há onda neste minuto (trava ocupada, janela em curso, fila vazia).
   */
  private markWave(vacancyId: string, now: Date): Promise<Wave | null> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Vacancy" WHERE id = ${vacancyId}::uuid FOR UPDATE SKIP LOCKED`;
      if (locked.length === 0) return null;

      const vacancy = await tx.vacancy.findUniqueOrThrow({
        where: { id: vacancyId },
        include: { slot: { include: { clinic: true, exam: true } } },
      });
      const { slot } = vacancy;
      if (vacancy.state !== 'publicada' && vacancy.state !== 'alertando') {
        return null;
      }
      if (slot.startsAt <= now) return null;

      if (vacancy.state === 'alertando') {
        const last = await tx.transition.findFirst({
          where: { vacancyId, toState: 'alertando' },
          orderBy: { occurredAt: 'desc' },
          select: { occurredAt: true },
        });
        const windowEnds = last
          ? last.occurredAt.getTime() +
            slot.clinic.waveWindowMinutes * MINUTE_MS
          : 0;
        if (now.getTime() < windowEnds) return null;
      }

      const candidates = await this.matching.candidatos(vacancyId, now);
      if (candidates.length === 0) {
        if (vacancy.state === 'alertando') {
          await this.vacancies.transition(
            vacancyId,
            'publicada',
            { origin: 'motor', reason: EXHAUSTED_REASON },
            tx,
            now,
          );
        }
        return null;
      }

      const previous = await tx.alert.aggregate({
        where: { vacancyId },
        _max: { wave: true },
      });
      const number = (previous._max.wave ?? 0) + 1;
      await this.vacancies.transition(
        vacancyId,
        'alertando',
        {
          origin: 'motor',
          reason: `Onda ${number}`,
        },
        tx,
        now,
      );
      return {
        vacancyId,
        number,
        size: slot.clinic.waveSize,
        candidates,
        clinic: slot.clinic,
        message: {
          clinicName: slot.clinic.name,
          examName: slot.exam.name,
          startsAt: slot.startsAt,
          priceCents: vacancy.currentPriceCents,
          preparation: slot.exam.preparationCondition.trim() || null,
          vacancyUrl: `${this.env.WEB_ORIGIN}/vagas/${vacancyId}`,
        },
      };
    });
  }

  /**
   * Envia a onda já marcada, em lotes na ordem da fila: o primeiro com os N
   * primeiros, cada seguinte com o que falta para N. Conta o paciente com algum
   * resultado diferente de `sem_canal`; um paciente que falha não derruba os
   * outros. A gravação de `Alert` é do `NotificationsService`.
   */
  private async send(wave: Wave): Promise<void> {
    const reached: Candidate[] = [];
    let next = 0;
    while (reached.length < wave.size && next < wave.candidates.length) {
      const batch = wave.candidates.slice(
        next,
        next + wave.size - reached.length,
      );
      next += batch.length;
      const results = await Promise.allSettled(
        batch.map((candidate) =>
          this.notifications.enviar(
            candidate.patientId,
            {
              ...wave.message,
              distanceMeters: haversineMeters(candidate, wave.clinic),
            },
            {
              vacancyId: wave.vacancyId,
              subscriptionId: candidate.id,
              wave: wave.number,
            },
          ),
        ),
      );
      results.forEach((result, index) => {
        const candidate = batch[index]!;
        if (result.status === 'rejected') {
          this.logger.warn(
            `Envio da onda ${wave.number} da vaga ${wave.vacancyId} falhou para a inscrição ${candidate.id}: ${errorMessage(result.reason)}`,
          );
          return;
        }
        if (result.value.some((outcome) => outcome.result !== 'sem_canal')) {
          reached.push(candidate);
        }
      });
    }
    if (reached.length === 0) return;

    try {
      const patients = await this.prisma.patient.findMany({
        where: { id: { in: reached.map((c) => c.patientId) } },
        select: { userId: true },
      });
      // Ids de `User`, que são as salas do socket; nunca `Patient.id` (HACK-38).
      this.realtime.vagaPublicada(
        { vagaId: wave.vacancyId },
        patients.map((patient) => patient.userId),
      );
    } catch (error) {
      this.logger.error(
        `Aviso em tempo real da onda ${wave.number} da vaga ${wave.vacancyId} falhou: ${errorMessage(error)}`,
      );
    }
  }
}
