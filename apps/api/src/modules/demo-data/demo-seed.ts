import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { allowedExams, examQuestionnaireSchema } from '@hackathon/contracts';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { examQuestionnairesSeed } from '../exams/exam-questionnaires.seed';

const clinicSourceSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  cnes: z.string().regex(/^\d{7}$/),
  technicalManager: z.string().min(1),
  sources: z.array(z.url()).min(1),
  verifiedAt: z.iso.date(),
  demoCalendarTarget: z.boolean(),
});
export function readClinics() {
  const path = resolve(process.cwd(), 'src/modules/demo-data/clinics.json');
  return z
    .array(clinicSourceSchema)
    .length(10)
    .parse(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}

// Preços fictícios, em centavos; não são ofertas das clínicas referenciadas.
const prices = {
  'us-abdomen': [22000, 15000],
  'us-pelvis-transabdominal': [22000, 15000],
  'us-thyroid': [18000, 12000],
  'us-breast': [18000, 12000],
  'us-musculoskeletal': [22000, 15000],
  'echo-transthoracic': [35000, 24000],
  mammography: [25000, 17000],
  'ct-without-contrast': [40000, 28000],
  'mri-without-contrast': [72000, 50000],
} as const;
// O modelo HACK-41 de abdome superior não cobre abdome total.
export const protocols = allowedExams.filter(
  (exam) => exam.tussCode !== '40901122',
);

export function validateSeedEnvironment(env: NodeJS.ProcessEnv) {
  if (
    !['development', 'test'].includes(env.NODE_ENV ?? '') ||
    env.DEMO_SEED_ENABLED !== 'true'
  ) {
    throw new Error(
      'Seed exige NODE_ENV development/test e DEMO_SEED_ENABLED=true.',
    );
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL obrigatória.');
  const url = new URL(env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Seed permitido somente em banco local.');
  }
}

/** Só Prisma gera IDs; chaves naturais tornam execuções repetidas idempotentes. */
export async function seedDemo(prisma: PrismaClient, clinics = readClinics()) {
  if (
    clinics.length !== 10 ||
    new Set(clinics.map((clinic) => clinic.cnes)).size !== 10 ||
    clinics.filter((clinic) => clinic.demoCalendarTarget).length !== 2
  ) {
    throw new Error(
      'Manifesto exige dez clínicas distintas e dois alvos de agenda.',
    );
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(150015)`;
      const clock = await tx.demoClock.findUnique({ where: { id: 1 } });
      const now = new Date(Date.now() + (clock?.offsetMinutes ?? 0) * 60000);
      const days = Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startMinute: 0,
        endMinute: 1440,
      }));
      const demoUser = async (email: string, name: string, role: string) => {
        const existing = await tx.user.findUnique({
          where: { email },
          include: { _count: { select: { accounts: true, sessions: true } } },
        });
        if (
          existing &&
          (existing.role !== role ||
            existing.name !== name ||
            existing._count.accounts ||
            existing._count.sessions)
        ) {
          throw new Error('Conflito de identidade de demonstração.');
        }
        return tx.user.upsert({
          where: { email },
          create: { email, name, role },
          update: {},
        });
      };
      for (const [index, source] of clinics.entries()) {
        const user = await demoUser(
          `clinic-${index}@hack15.demo.invalid`,
          `Demonstração — ${source.name}`,
          'clinica',
        );
        const existing = await tx.clinic.findFirst({
          where: { OR: [{ cnes: source.cnes }, { userId: user.id }] },
        });
        if (
          existing &&
          (existing.userId !== user.id || existing.cnes !== source.cnes)
        )
          throw new Error('Conflito de CNES/identidade de clínica.');
        const data = {
          name: source.name,
          address: source.address,
          latitude: source.latitude,
          longitude: source.longitude,
          cnes: source.cnes,
          technicalManager: source.technicalManager,
          demoCalendarTarget: source.demoCalendarTarget,
        };
        const clinic = await tx.clinic.upsert({
          where: { cnes: source.cnes },
          create: { userId: user.id, ...data },
          update: data,
        });
        // Sem unique por dia no schema: preservar os IDs de expediente já existentes.
        for (const day of days) {
          const hours = await tx.clinicOpeningHours.findFirst({
            where: { clinicId: clinic.id, weekday: day.weekday },
          });
          if (hours)
            await tx.clinicOpeningHours.update({
              where: { id: hours.id },
              data: day,
            });
          else
            await tx.clinicOpeningHours.create({
              data: { clinicId: clinic.id, ...day },
            });
        }
        for (const protocol of protocols) {
          const questionnaire = examQuestionnaireSchema.parse(
            examQuestionnairesSeed.find(
              (item) => item.key === protocol.questionnaireKey,
            ),
          );
          const [fullPriceCents, floorPriceCents] =
            prices[protocol.questionnaireKey];
          const data = {
            name:
              protocol.tussCode === '41101316'
                ? 'Ressonância magnética de joelho sem contraste'
                : protocol.name,
            fullPriceCents,
            floorPriceCents,
            minLeadMinutes: 60,
            preparationCondition: questionnaire.preparation.condition,
            preparationHours: questionnaire.preparation.hoursBefore,
            contraindications: questionnaire.contraindications.map(
              (item) => item.id,
            ),
            questionnaireKey: questionnaire.key,
            questionnaireVersion: questionnaire.version,
            toleranceMinutes: 15,
            maxTravelMinutes: 60,
          };
          const exam = await tx.exam.upsert({
            where: {
              clinicId_tussCode: {
                clinicId: clinic.id,
                tussCode: protocol.tussCode,
              },
            },
            create: {
              clinicId: clinic.id,
              tussCode: protocol.tussCode,
              ...data,
            },
            update: data,
          });
          for (const [leadMinutes, discountPercent] of [
            [2880, 10],
            [1440, 20],
            [360, 30],
          ] as const) {
            await tx.priceStep.upsert({
              where: { examId_leadMinutes: { examId: exam.id, leadMinutes } },
              create: { examId: exam.id, leadMinutes, discountPercent },
              update: { discountPercent },
            });
          }
        }
      }
      for (let index = 0; index < 12; index++) {
        const user = await demoUser(
          `patient-${index}@hack15.demo.invalid`,
          `Paciente FICTÍCIO de demonstração ${index + 1}`,
          'paciente',
        );
        // Consentimento e telefone sintéticos; WhatsApp só é operacional no modo simulated.
        const data = {
          phone: `+55110000000${String(index + 1).padStart(2, '0')}`,
          phoneVerifiedAt: new Date('2026-01-01T00:00:00Z'),
          alertChannels: ['email', 'whatsapp'] as ('email' | 'whatsapp')[],
          healthDataConsentAt: new Date('2026-01-01T00:00:00Z'),
        };
        const patient = await tx.patient.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...data },
          update: data,
        });
        const subscriptionData = {
          maxPriceCents: 72000,
          latitude: -23.55,
          longitude: -46.64,
          radiusMeters: 50000,
          canGoToday: true,
          currentLatitude: -23.55,
          currentLongitude: -46.64,
          expiresAt: new Date(now.getTime() + 30 * 86400000),
        };
        const subscription = await tx.subscription.upsert({
          where: {
            patientId_tussCode: { patientId: patient.id, tussCode: '41101316' },
          },
          create: {
            patientId: patient.id,
            tussCode: '41101316',
            ...subscriptionData,
            createdAt: new Date(now.getTime() - (12 - index) * 1000),
          },
          update: subscriptionData,
        });
        for (const day of days) {
          const window = await tx.subscriptionWindow.findFirst({
            where: { subscriptionId: subscription.id, weekday: day.weekday },
          });
          if (window)
            await tx.subscriptionWindow.update({
              where: { id: window.id },
              data: day,
            });
          else
            await tx.subscriptionWindow.create({
              data: { subscriptionId: subscription.id, ...day },
            });
        }
      }
      return {
        clinics: clinics.length,
        exams: clinics.length * protocols.length,
        patients: 12,
        subscriptions: 12,
        windows: 84,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 60000,
    },
  );
}
