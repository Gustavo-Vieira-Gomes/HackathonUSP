import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PatientRetentionJob {
  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 0 * * * *', {
    name: 'patient-subscription-retention',
    waitForCompletion: true,
  })
  async run(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Windows são apagadas pelo CASCADE da FK; o perfil e o consentimento permanecem.
    const result = await this.prisma.subscription.deleteMany({
      where: { expiresAt: { lte: cutoff } },
    });
    return result.count;
  }
}
