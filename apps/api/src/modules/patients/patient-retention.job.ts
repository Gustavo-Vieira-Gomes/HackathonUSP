import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../clock/clock.service';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;

/** RN-13: removes dependent history as well, without retaining patient links. */
@Injectable()
export class PatientRetentionJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  @Cron('0 * * * * *', {
    name: 'patient-data-retention',
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    await this.clock.refresh();
    const cutoff = new Date(this.clock.now().getTime() - THIRTY_DAYS_MS);
    await this.prisma.$transaction(async (tx) => {
      const reservations = { slot: { endsAt: { lte: cutoff } } };
      await tx.transition.deleteMany({ where: { reservation: reservations } });
      await tx.reservation.deleteMany({ where: reservations });
      const subscriptions = { expiresAt: { lte: cutoff } };
      // Messages reference alert ids without an FK; remove that copy of health data too.
      const alerts = await tx.alert.findMany({
        where: { subscription: subscriptions },
        select: { id: true },
      });
      await tx.simulatedWhatsappMessage.deleteMany({
        where: { alertId: { in: alerts.map((alert) => alert.id) } },
      });
      await tx.alert.deleteMany({ where: { subscription: subscriptions } });
      await tx.subscription.deleteMany({ where: subscriptions });
    });
  }
}
