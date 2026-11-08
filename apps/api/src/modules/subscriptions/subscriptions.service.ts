import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  allowedExams,
  type SubscriptionListItem,
  type SubscriptionCreateBody,
} from '@hackathon/contracts';
import type {
  Subscription,
  SubscriptionWindow,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../clock/clock.service';
import { GeocodingService } from '../clinics/geocoding.service';
import { MatchingService } from '../vacancies/matching.service';
import { haversineMeters } from '../vacancies/matching-rules';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;
type WithWindows = Subscription & { windows: SubscriptionWindow[] };

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly matching: MatchingService,
    private readonly geocoding: GeocodingService,
  ) {}

  async create(patientId: string, body: SubscriptionCreateBody) {
    if (!allowedExams.some((exam) => exam.tussCode === body.tussCode)) {
      throw new UnprocessableEntityException({
        code: 'EXAM_NOT_ALLOWED',
        message: 'Escolha um exame da lista.',
      });
    }
    const point = body.address
      ? await this.geocoding.geocode(body.address)
      : { latitude: body.latitude!, longitude: body.longitude! };
    if (!point)
      throw new BadRequestException({
        code: 'ADDRESS_NOT_FOUND',
        message: 'Endereço não encontrado.',
      });
    await this.clock.refresh();
    const now = this.clock.now();
    const data = {
      tussCode: body.tussCode,
      maxPriceCents: body.maxPriceCents,
      ...point,
      radiusMeters: body.radiusMeters,
      canGoToday: body.canGoToday,
      currentLatitude: body.canGoToday ? body.currentLatitude : null,
      currentLongitude: body.canGoToday ? body.currentLongitude : null,
      expiresAt: new Date(now.getTime() + THIRTY_DAYS_MS),
      expirationEmailSentAt: null,
    };
    // Upsert usa a unicidade paciente/TUSS. Troca de janelas e dados é atômica.
    const subscription = await this.prisma.subscription.upsert({
      where: { patientId_tussCode: { patientId, tussCode: body.tussCode } },
      create: { patientId, ...data, windows: { create: body.windows } },
      update: { ...data, windows: { deleteMany: {}, create: body.windows } },
      include: { windows: true },
    });
    return this.result(subscription, now);
  }

  async list(patientId: string) {
    await this.clock.refresh();
    const now = this.clock.now();
    const subscriptions = await this.prisma.subscription.findMany({
      where: { patientId },
      include: { windows: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      subscriptions: await Promise.all(
        subscriptions.map((row) => this.present(row, now)),
      ),
    };
  }

  async renew(patientId: string, id: string) {
    await this.clock.refresh();
    const now = this.clock.now();
    // Filtro de dono tanto na leitura quanto na escrita, sem aceitar patientId do corpo.
    const found =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        ? await this.prisma.subscription.findFirst({ where: { id, patientId } })
        : null;
    if (!found)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Inscrição não encontrada.',
      });
    const subscription = await this.prisma.subscription.update({
      where: { id, patientId },
      data: {
        expiresAt: new Date(now.getTime() + THIRTY_DAYS_MS),
        expirationEmailSentAt: null,
      },
      include: { windows: true },
    });
    return this.result(subscription, now);
  }

  private async result(row: WithWindows, now: Date) {
    const subscription = await this.present(row, now);
    return { subscription, matchedVacancyId: subscription.matchedVacancyId };
  }

  private async present(
    row: WithWindows,
    now: Date,
  ): Promise<SubscriptionListItem> {
    const active = row.expiresAt > now;
    const [clinics, vacancies] = await Promise.all([
      this.prisma.clinic.findMany({
        where: { exams: { some: { tussCode: row.tussCode } } },
        select: { latitude: true, longitude: true },
      }),
      active
        ? this.matching.vagasCompativeis(row.id, now)
        : Promise.resolve([]),
    ]);
    return {
      id: row.id,
      tussCode: row.tussCode,
      maxPriceCents: row.maxPriceCents,
      latitude: row.latitude,
      longitude: row.longitude,
      radiusMeters: row.radiusMeters,
      canGoToday: row.canGoToday,
      currentLatitude: row.currentLatitude,
      currentLongitude: row.currentLongitude,
      expiresAt: row.expiresAt.toISOString(),
      active,
      windows: row.windows.map(({ weekday, startMinute, endMinute }) => ({
        weekday,
        startMinute,
        endMinute,
      })),
      clinicCount: clinics.filter(
        (clinic) => haversineMeters(row, clinic) <= row.radiusMeters,
      ).length,
      matchedVacancyId: vacancies[0]?.id ?? null,
    };
  }
}
