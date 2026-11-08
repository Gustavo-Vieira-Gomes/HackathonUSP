import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MINUTE_MS = 60_000;
const ROW_ID = 1;

/**
 * Relógio único das regras de tempo (HACK-30): preço, máquina de estados, ondas,
 * expirações e intenção de pagamento leem `now()` em vez de `new Date()`, para o
 * controle de tempo da demo mover tudo junto.
 *
 * O deslocamento vive no banco (`DemoClock`, uma linha), não na memória: um restart
 * no meio da demo não volta o relógio. A cópia em memória só evita uma consulta por
 * leitura; quem roda em ciclo (o cron do HACK-32) chama `refresh()` no começo de
 * cada ciclo para ver o que outra instância ou o endpoint gravou.
 *
 * Tempo que mede o processo, e não o negócio (timeout de canal, idade de alerta
 * pendente), continua no relógio real.
 */
@Injectable()
export class ClockService implements OnModuleInit {
  private offsetMinutesCache = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /** Instante atual do negócio: relógio real mais o deslocamento da demo. */
  now(): Date {
    return new Date(Date.now() + this.offsetMinutesCache * MINUTE_MS);
  }

  offsetMinutes(): number {
    return this.offsetMinutesCache;
  }

  /** Relê o deslocamento gravado. */
  async refresh(): Promise<number> {
    const row = await this.prisma.demoClock.findUnique({
      where: { id: ROW_ID },
      select: { offsetMinutes: true },
    });
    this.offsetMinutesCache = row?.offsetMinutes ?? 0;
    return this.offsetMinutesCache;
  }

  /**
   * Adianta o relógio. Só para frente: voltar o tempo faria o preço subir, o que a
   * RN-27 proíbe. O incremento é atômico no banco, então dois avanços somam.
   */
  async advance(minutes: number): Promise<number> {
    if (!Number.isInteger(minutes) || minutes <= 0) {
      throw new RangeError('minutes deve ser inteiro maior que zero');
    }
    const row = await this.prisma.demoClock.upsert({
      where: { id: ROW_ID },
      create: { id: ROW_ID, offsetMinutes: minutes },
      update: { offsetMinutes: { increment: minutes } },
      select: { offsetMinutes: true },
    });
    this.offsetMinutesCache = row.offsetMinutes;
    return row.offsetMinutes;
  }

  /** Volta ao relógio real. Só para preparar uma nova demo, não durante uma. */
  async reset(): Promise<void> {
    await this.prisma.demoClock.deleteMany({ where: { id: ROW_ID } });
    this.offsetMinutesCache = 0;
  }
}
