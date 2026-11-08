import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

/** Ponto de extensão do HACK-33; HACK-20 só registra a falta, sem republicar. */
@Injectable()
export class NoShowMotorService {
  async onDeclared(
    _tx: Prisma.TransactionClient,
    _reservation: { id: string; slotId: string; vacancyId: string | null },
  ): Promise<void> {
    void _tx;
    void _reservation;
    // HACK-33 implementa a oferta imediata nesta mesma transação.
  }
}
