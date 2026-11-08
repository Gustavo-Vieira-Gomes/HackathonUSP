import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { examQuestionnaireSchema } from '@hackathon/contracts';
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
export function demoId(kind: string, index: number): string {
  const hex = createHash('sha256')
    .update(`hack15-demo-v1:${kind}:${index}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export const protocols = [
  ['40901130', 'US de abdome superior adulto', 'us-abdomen', 22000, 15000],
  [
    '40901181',
    'US pélvica feminina transabdominal adulta',
    'us-pelvis-transabdominal',
    22000,
    15000,
  ],
  ['40901203', 'US de tireoide', 'us-thyroid', 18000, 12000],
  ['40901114', 'US de mamas', 'us-breast', 18000, 12000],
  ['40901220', 'US articular de joelho', 'us-musculoskeletal', 22000, 15000],
  [
    '40901106',
    'Ecocardiograma transtorácico em repouso sem contraste ou sedação',
    'echo-transthoracic',
    35000,
    24000,
  ],
  ['40808041', 'Mamografia digital bilateral', 'mammography', 25000, 17000],
  [
    '41001010',
    'TC de crânio adulto sem contraste ou sedação',
    'ct-without-contrast',
    40000,
    28000,
  ],
  [
    '41001079',
    'TC de tórax adulto sem contraste ou sedação',
    'ct-without-contrast',
    45000,
    32000,
  ],
  [
    '41101316',
    'RM articular de joelho adulto sem contraste ou sedação',
    'mri-without-contrast',
    72000,
    50000,
  ],
] as const;

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

/** Identidades do manifesto nunca são adotadas por email/CNES. Escritas são atômicas. */
export async function seedDemo(prisma: PrismaClient, clinics = readClinics()) {
  if (
    clinics.length !== 10 ||
    clinics.filter((clinic) => clinic.demoCalendarTarget).length !== 2
  ) {
    throw new Error('Manifesto exige dez clínicas e dois alvos de agenda.');
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(150015)`;
      for (let index = 0; index < clinics.length; index++) {
        const clinic = clinics[index]!;
        const userId = demoId('clinic-user', index);
        const id = demoId('clinic', index);
        const email = `clinic-${index}@hack15.demo.invalid`;
        const user = await tx.user.findFirst({
          where: { OR: [{ id: userId }, { email }] },
        });
        if (
          user &&
          (user.id !== userId ||
            user.email !== email ||
            user.role !== 'clinica')
        )
          throw new Error('Conflito de identidade de clínica.');
        const existing = await tx.clinic.findFirst({
          where: { OR: [{ id }, { cnes: clinic.cnes }, { userId }] },
        });
        if (
          existing &&
          (existing.id !== id ||
            existing.userId !== userId ||
            existing.cnes !== clinic.cnes)
        )
          throw new Error('Conflito de CNES/identidade de clínica.');
        await tx.user.upsert({
          where: { id: userId },
          create: {
            id: userId,
            email,
            role: 'clinica',
            name: `Demonstração — ${clinic.name}`,
          },
          update: {},
        });
        const data = {
          name: clinic.name,
          address: clinic.address,
          latitude: clinic.latitude,
          longitude: clinic.longitude,
          cnes: clinic.cnes,
          technicalManager: clinic.technicalManager,
          demoCalendarTarget: clinic.demoCalendarTarget,
        };
        await tx.clinic.upsert({
          where: { id },
          create: { id, userId, ...data },
          update: data,
        });
        for (let day = 0; day < 7; day++) {
          const hoursId = demoId('opening-hours', index * 7 + day);
          const existingHours = await tx.clinicOpeningHours.findUnique({
            where: { id: hoursId },
          });
          if (existingHours && existingHours.clinicId !== id)
            throw new Error('Conflito de expediente.');
          const hours = {
            clinicId: id,
            weekday: day,
            startMinute: 0,
            endMinute: 1440,
          };
          await tx.clinicOpeningHours.upsert({
            where: { id: hoursId },
            create: { id: hoursId, ...hours },
            update: hours,
          });
        }
        for (
          let protocolIndex = 0;
          protocolIndex < protocols.length;
          protocolIndex++
        ) {
          const [tussCode, name, key, fullPriceCents, floorPriceCents] =
            protocols[protocolIndex]!;
          const questionnaire = examQuestionnaireSchema.parse(
            examQuestionnairesSeed.find((item) => item.key === key),
          );
          const examId = demoId('exam', index * 10 + protocolIndex);
          const existingExam = await tx.exam.findFirst({
            where: { OR: [{ id: examId }, { clinicId: id, tussCode }] },
          });
          if (
            existingExam &&
            (existingExam.id !== examId ||
              existingExam.clinicId !== id ||
              existingExam.tussCode !== tussCode)
          )
            throw new Error('Conflito de exame.');
          const exam = {
            clinicId: id,
            tussCode,
            name,
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
            questionnaire: questionnaire as Prisma.InputJsonObject,
            toleranceMinutes: 15,
            maxTravelMinutes: 60,
          };
          await tx.exam.upsert({
            where: { id: examId },
            create: { id: examId, ...exam },
            update: exam,
          });
          for (const [step, leadMinutes, discountPercent] of [
            [0, 2880, 10],
            [1, 1440, 20],
            [2, 360, 30],
          ] as const) {
            const stepId = demoId(
              'price-step',
              (index * 10 + protocolIndex) * 3 + step,
            );
            const existingStep = await tx.priceStep.findFirst({
              where: { OR: [{ id: stepId }, { examId, leadMinutes }] },
            });
            if (
              existingStep &&
              (existingStep.id !== stepId || existingStep.examId !== examId)
            )
              throw new Error('Conflito de degrau.');
            await tx.priceStep.upsert({
              where: { id: stepId },
              create: { id: stepId, examId, leadMinutes, discountPercent },
              update: { leadMinutes, discountPercent },
            });
          }
        }
      }
      for (let index = 0; index < 12; index++) {
        const userId = demoId('patient-user', index),
          id = demoId('patient', index),
          subscriptionId = demoId('subscription', index);
        const email = `patient-${index}@hack15.demo.invalid`;
        const user = await tx.user.findFirst({
          where: { OR: [{ id: userId }, { email }] },
        });
        if (
          user &&
          (user.id !== userId ||
            user.email !== email ||
            user.role !== 'paciente')
        )
          throw new Error('Conflito de usuário fictício.');
        const patient = await tx.patient.findFirst({
          where: { OR: [{ id }, { userId }] },
        });
        if (patient && (patient.id !== id || patient.userId !== userId))
          throw new Error('Conflito de paciente.');
        if (
          (await tx.account.count({ where: { userId } })) ||
          (await tx.session.count({ where: { userId } }))
        )
          throw new Error('Conta fictícia não pode ter login.');
        await tx.user.upsert({
          where: { id: userId },
          create: {
            id: userId,
            email,
            role: 'paciente',
            name: `Paciente FICTÍCIO de demonstração ${index + 1}`,
          },
          update: {},
        });
        // Data técnica sintética, nunca representa consentimento de uma pessoa real.
        const patientData = {
          phone: 'DEMO-SEM-TELEFONE',
          alertChannels: [],
          healthDataConsentAt: new Date('2026-01-01T00:00:00Z'),
        };
        await tx.patient.upsert({
          where: { id },
          create: { id, userId, ...patientData },
          update: patientData,
        });
        const existingSubscription = await tx.subscription.findFirst({
          where: {
            OR: [
              { id: subscriptionId },
              { patientId: id, tussCode: '41101316' },
            ],
          },
        });
        if (
          existingSubscription &&
          (existingSubscription.id !== subscriptionId ||
            existingSubscription.patientId !== id ||
            existingSubscription.tussCode !== '41101316')
        )
          throw new Error('Conflito de inscrição.');
        const subscription = {
          patientId: id,
          tussCode: '41101316',
          maxPriceCents: 72000,
          latitude: -23.55,
          longitude: -46.64,
          radiusMeters: 50000,
          expiresAt: new Date(Date.now() + 365 * 86400000),
        };
        await tx.subscription.upsert({
          where: { id: subscriptionId },
          create: { id: subscriptionId, ...subscription },
          update: subscription,
        });
        for (let day = 0; day < 7; day++) {
          const windowId = demoId('window', index * 7 + day);
          const existingWindow = await tx.subscriptionWindow.findUnique({
            where: { id: windowId },
          });
          if (
            existingWindow &&
            existingWindow.subscriptionId !== subscriptionId
          )
            throw new Error('Conflito de janela.');
          const window = {
            subscriptionId,
            weekday: day,
            startMinute: 0,
            endMinute: 1440,
          };
          await tx.subscriptionWindow.upsert({
            where: { id: windowId },
            create: { id: windowId, ...window },
            update: window,
          });
        }
      }
      return {
        clinics: 10,
        exams: 100,
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
