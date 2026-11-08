import type { ClinicProfile, ClinicVacancy } from '@hackathon/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Leituras da clínica da sessão; toda consulta filtra por `clinicId`. */
@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(clinicId: string): Promise<ClinicProfile> {
    return this.prisma.clinic.findUniqueOrThrow({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        cnes: true,
        technicalManager: true,
        openingHours: {
          select: { weekday: true, startMinute: true, endMinute: true },
          orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        },
      },
    });
  }

  /** Vaga de outra clínica, inexistente ou com id inválido: o mesmo 404. */
  async vacancy(clinicId: string, id: string): Promise<ClinicVacancy> {
    const vacancy = UUID.test(id)
      ? await this.prisma.vacancy.findFirst({
          where: { id, slot: { clinicId } },
          select: {
            id: true,
            state: true,
            origin: true,
            currentPriceCents: true,
            slot: { select: { startsAt: true, endsAt: true, examId: true } },
          },
        })
      : null;
    if (!vacancy) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Vaga não encontrada.',
      });
    }
    return {
      ...vacancy,
      slot: {
        startsAt: vacancy.slot.startsAt.toISOString(),
        endsAt: vacancy.slot.endsAt.toISOString(),
        examId: vacancy.slot.examId,
      },
    };
  }
}
