import { Injectable } from '@nestjs/common';
import {
  clinicsResponseSchema,
  type ClinicsResponse,
} from '@hackathon/contracts';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}
  async search(q?: string): Promise<ClinicsResponse> {
    const clinics = await this.prisma.clinic.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        demoCalendarTarget: true,
        exams: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            tussCode: true,
            name: true,
            fullPriceCents: true,
            floorPriceCents: true,
          },
        },
      },
    });
    return clinicsResponseSchema.parse({ clinics });
  }
}
