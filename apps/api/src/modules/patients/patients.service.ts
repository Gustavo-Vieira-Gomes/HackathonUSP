import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async reservation(patientId: string, id: string) {
    const reservation = UUID.test(id)
      ? await this.prisma.reservation.findFirst({
          where: { id, patientId },
          select: {
            id: true,
            state: true,
            type: true,
            chargedPriceCents: true,
            depositCents: true,
            paymentMethod: true,
            slot: {
              select: {
                startsAt: true,
                endsAt: true,
                exam: { select: { name: true } },
              },
            },
          },
        })
      : null;
    if (!reservation)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Reserva não encontrada.',
      });
    return {
      ...reservation,
      slot: {
        ...reservation.slot,
        startsAt: reservation.slot.startsAt.toISOString(),
        endsAt: reservation.slot.endsAt.toISOString(),
      },
    };
  }

  async subscription(patientId: string, id: string) {
    const subscription = UUID.test(id)
      ? await this.prisma.subscription.findFirst({
          where: { id, patientId },
          select: {
            id: true,
            tussCode: true,
            maxPriceCents: true,
            radiusMeters: true,
            canGoToday: true,
            expiresAt: true,
            windows: {
              select: { weekday: true, startMinute: true, endMinute: true },
            },
          },
        })
      : null;
    if (!subscription)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Inscrição não encontrada.',
      });
    return { ...subscription, expiresAt: subscription.expiresAt.toISOString() };
  }
}
