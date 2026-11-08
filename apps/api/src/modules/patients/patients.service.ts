import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  SessionUser,
  PatientSubscriptionResponse,
} from '@hackathon/contracts';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async subscription(
    user: SessionUser,
    id: string,
  ): Promise<PatientSubscriptionResponse> {
    // O filtro de dono faz parte da consulta: outro paciente e id inexistente têm a mesma resposta.
    const subscription =
      user.role === 'paciente'
        ? await this.prisma.subscription.findFirst({
            where: { id, patient: { userId: user.id } },
            select: {
              id: true,
              tussCode: true,
              maxPriceCents: true,
              expiresAt: true,
            },
          })
        : null;
    if (!subscription) throw new NotFoundException();
    return { ...subscription, expiresAt: subscription.expiresAt.toISOString() };
  }
}
