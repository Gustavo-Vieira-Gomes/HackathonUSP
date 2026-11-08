import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
  Transition,
  TransitionOrigin,
  Vacancy,
  VacancyState,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../clock/clock.service';
import { canTransition } from './vacancy-transitions';

export type TransitionMeta = { origin: TransitionOrigin; reason: string };

const REASON_MAX = 500;
const EXPIRE_REASON = 'Horário do exame chegou sem reserva';

/**
 * Máquina de estados da vaga (RN-24) e log de transições (RN-50). Toda mudança de
 * `Vacancy.state` passa por aqui e grava a `Transition` na mesma transação. Com `tx`,
 * grava dentro da transação do chamador; sem, abre a própria.
 */
@Injectable()
export class VacanciesService {
  private readonly logger = new Logger(VacanciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** Cria a vaga em `publicada` com a primeira linha do log (T1). */
  async publish(
    data: Omit<Prisma.VacancyUncheckedCreateInput, 'state'>,
    meta: TransitionMeta,
    tx?: Prisma.TransactionClient,
  ): Promise<Vacancy> {
    const reason = this.validReason(meta);
    return this.run(tx, async (db) => {
      const vacancy = await db.vacancy.create({
        data: { ...data, state: 'publicada' },
      });
      await db.transition.create({
        data: {
          vacancyId: vacancy.id,
          fromState: null,
          toState: 'publicada',
          origin: meta.origin,
          reason,
          occurredAt: this.clock.now(),
        },
      });
      return vacancy;
    });
  }

  /**
   * Muda o estado se o par estiver na tabela; senão 409 sem gravar nada. `now` é o
   * instante do negócio gravado no `occurredAt`: o motor passa o do tick, para a
   * onda ficar no minuto em que foi decidida (HACK-32).
   */
  async transition(
    vacancyId: string,
    to: VacancyState,
    meta: TransitionMeta,
    tx?: Prisma.TransactionClient,
    now: Date = this.clock.now(),
  ): Promise<Vacancy> {
    return this.apply(vacancyId, to, meta, now, tx);
  }

  /**
   * Expira as vagas sem reserva cujo horário chegou (RN-25). Uma transação por vaga:
   * a que perde uma corrida (409) ou falha por outro motivo fica de fora da contagem
   * e não para as outras; a falha que não é corrida vai para o log.
   */
  async expireDue(now: Date = this.clock.now()): Promise<number> {
    const due = await this.prisma.vacancy.findMany({
      where: {
        state: { in: ['publicada', 'alertando'] },
        slot: { startsAt: { lte: now } },
      },
      select: { id: true },
    });
    let expired = 0;
    for (const { id } of due) {
      try {
        await this.apply(
          id,
          'expirada',
          { origin: 'motor', reason: EXPIRE_REASON },
          now,
        );
        expired += 1;
      } catch (error) {
        if (error instanceof ConflictException) continue;
        this.logger.warn(
          `Expiração da vaga ${id} falhou: ${
            error instanceof Error ? error.message : 'erro desconhecido'
          }`,
        );
      }
    }
    return expired;
  }

  /** Linha do tempo da vaga em ordem cronológica (F14). */
  async timeline(vacancyId: string): Promise<Transition[]> {
    return this.prisma.transition.findMany({
      where: { vacancyId },
      orderBy: { occurredAt: 'asc' },
    });
  }

  private async apply(
    vacancyId: string,
    to: VacancyState,
    meta: TransitionMeta,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<Vacancy> {
    const reason = this.validReason(meta);
    return this.run(tx, async (db) => {
      const vacancy = await db.vacancy.findUnique({
        where: { id: vacancyId },
        include: { slot: { select: { startsAt: true } } },
      });
      if (!vacancy) throw new NotFoundException('Vaga não encontrada');
      const from = vacancy.state;
      if (!canTransition(from, to)) this.refuse(vacancyId, from, to, meta);
      // T8: só expira quando o horário chegou.
      if (to === 'expirada' && vacancy.slot.startsAt > now) {
        this.refuse(vacancyId, from, to, meta);
      }
      // Update condicional: se outro chamador mudou o estado depois da leitura,
      // nenhuma linha casa e a transição é recusada (porta 4).
      const { count } = await db.vacancy.updateMany({
        where: { id: vacancyId, state: from },
        data: { state: to },
      });
      if (count !== 1) this.refuse(vacancyId, from, to, meta);
      await db.transition.create({
        data: {
          vacancyId,
          fromState: from,
          toState: to,
          origin: meta.origin,
          reason,
          occurredAt: await this.nextOccurredAt(db, vacancyId, now),
        },
      });
      return db.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
    });
  }

  /**
   * `occurredAt` estritamente crescente por vaga (porta 5): o update acima trava a
   * linha da vaga, então duas transições da mesma vaga não intercalam aqui.
   */
  private async nextOccurredAt(
    db: Prisma.TransactionClient,
    vacancyId: string,
    now: Date,
  ): Promise<Date> {
    const last = await db.transition.findFirst({
      where: { vacancyId },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });
    if (last && last.occurredAt.getTime() >= now.getTime()) {
      return new Date(last.occurredAt.getTime() + 1);
    }
    return now;
  }

  private refuse(
    vacancyId: string,
    from: VacancyState,
    to: VacancyState,
    meta: TransitionMeta,
  ): never {
    // Sem o motivo: texto livre pode carregar dado pessoal.
    this.logger.warn(
      `Transição de vaga recusada: vaga ${vacancyId} ${from} → ${to} (origem ${meta.origin})`,
    );
    throw new ConflictException(`Transição de vaga inválida: ${from} → ${to}`);
  }

  private validReason(meta: TransitionMeta): string {
    const reason = meta.reason.trim();
    if (reason.length === 0 || reason.length > REASON_MAX) {
      throw new BadRequestException(
        `Motivo da transição deve ter de 1 a ${REASON_MAX} caracteres`,
      );
    }
    return reason;
  }

  private run<T>(
    tx: Prisma.TransactionClient | undefined,
    fn: (db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return tx ? fn(tx) : this.prisma.$transaction(fn);
  }
}
