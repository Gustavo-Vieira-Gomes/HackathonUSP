import { z } from 'zod';

export const examQuestionnaireKeySchema = z.enum([
  'us-abdomen',
  'us-pelvis-transabdominal',
  'us-thyroid',
  'us-breast',
  'us-musculoskeletal',
  'echo-transthoracic',
  'mammography',
  'ct-without-contrast',
  'mri-without-contrast',
]);

export const screeningQuestionIdSchema = z.enum([
  'pregnancy',
  'pacemaker-or-defibrillator',
  'implant-or-device',
  'metal-fragment',
  'claustrophobia',
  'fasting-needs-assistance',
  'fluid-restriction',
]);

export const clinicalReviewSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('pending') }),
  z.strictObject({
    status: z.literal('approved'),
    reviewer: z.string().trim().min(1),
    professionalRegistration: z.string().trim().min(1),
    reviewedAt: z.iso.datetime({ offset: true }),
    evidenceUrl: z.url(),
  }),
]);

export const examQuestionnaireSchema = z
  .strictObject({
    key: examQuestionnaireKeySchema,
    version: z.number().int().positive(),
    name: z.string().trim().min(1),
    scope: z.string().trim().min(1),
    preparation: z.strictObject({
      condition: z.string().trim().min(1),
      hoursBefore: z.number().finite().min(0).max(72),
      confirmation: z.string().trim().min(1),
    }),
    contraindications: z.array(
      z.strictObject({
        id: screeningQuestionIdSchema,
        question: z.string().trim().min(1),
      }),
    ),
    referralMessage: z.string().trim().min(1),
    clinicalReview: clinicalReviewSchema,
    sources: z.array(z.url()).min(1),
  })
  .refine(
    ({ contraindications }) =>
      new Set(contraindications.map(({ id }) => id)).size ===
      contraindications.length,
    { message: 'Perguntas de triagem duplicadas', path: ['contraindications'] },
  );

// Apenas formato de transporte. O Nest deve conferir versão, conjunto completo
// de perguntas e decisões de reserva contra o questionário armazenado.
export const examQuestionnaireAnswersSchema = z
  .strictObject({
    questionnaireKey: examQuestionnaireKeySchema,
    questionnaireVersion: z.number().int().positive(),
    preparationConfirmed: z.boolean(),
    answers: z.array(
      z.strictObject({
        questionId: screeningQuestionIdSchema,
        answer: z.enum(['yes', 'no', 'unknown']),
      }),
    ),
  })
  .refine(
    ({ answers }) =>
      new Set(answers.map(({ questionId }) => questionId)).size ===
      answers.length,
    { message: 'Respostas duplicadas', path: ['answers'] },
  );

export type ExamQuestionnaire = z.infer<typeof examQuestionnaireSchema>;
export type ExamQuestionnaireAnswers = z.infer<
  typeof examQuestionnaireAnswersSchema
>;
