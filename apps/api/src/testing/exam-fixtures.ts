import { allowedExams } from '@hackathon/contracts';
import type { PrismaService } from '../prisma/prisma.service';

type QuestionnaireKey = (typeof allowedExams)[number]['questionnaireKey'];

/** TUSS da primeira entrada de `allowedExams` ligada ao questionário. */
export function tussOf(key: QuestionnaireKey): string {
  const exam = allowedExams.find((entry) => entry.questionnaireKey === key);
  if (!exam) throw new Error(`Sem exame permitido para ${key}.`);
  return exam.tussCode;
}

export const MRI = (): string => tussOf('mri-without-contrast');
export const THYROID = (): string => tussOf('us-thyroid');

/** Corpo válido de `POST /api/clinic/exams` (AC 1 do HACK-17): RM articular. */
export function examBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    tussCode: MRI(),
    fullPriceCents: 72000,
    floorPriceCents: 50000,
    minLeadMinutes: 360,
    preparationCondition: 'nenhum',
    preparationHours: 0,
    contraindications: ['pacemaker-or-defibrillator'],
    toleranceMinutes: 15,
    maxTravelMinutes: 45,
    priceSteps: [
      { leadMinutes: 2880, discountPercent: 10 },
      { leadMinutes: 1440, discountPercent: 20 },
      { leadMinutes: 360, discountPercent: 30 },
    ],
    ...overrides,
  };
}

/** Corpo válido de `PUT /api/clinic/exams/:id`: o do cadastro sem `tussCode`. */
export function examUpdateBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const body = examBody(overrides);
  delete body.tussCode;
  return { ...body, ...overrides };
}

/** Exames de clínicas de teste saem antes dos `User` (`Exam → Clinic` é `Restrict`). */
export async function deleteExamsOf(
  prisma: PrismaService,
  clinicIds: (string | undefined)[],
): Promise<void> {
  const ids = clinicIds.filter((id): id is string => Boolean(id));
  await prisma.exam.deleteMany({ where: { clinicId: { in: ids } } });
}

/** Linha do exame e degraus ordenados, para comparar antes e depois. */
export async function examSnapshot(prisma: PrismaService, id: string) {
  return prisma.exam.findUniqueOrThrow({
    where: { id },
    include: {
      priceSteps: {
        select: { leadMinutes: true, discountPercent: true },
        orderBy: { leadMinutes: 'desc' },
      },
    },
  });
}
