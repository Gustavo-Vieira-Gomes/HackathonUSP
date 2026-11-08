import { z } from 'zod';
import {
  examQuestionnaireKeySchema,
  screeningQuestionIdSchema,
} from './exam-questionnaires';

type ExamQuestionnaireKey = z.infer<typeof examQuestionnaireKeySchema>;

export interface AllowedExam {
  /** Código TUSS de 8 dígitos (Terminologia 22 da ANS). */
  tussCode: string;
  name: string;
  /** Questionário do HACK-41 ligado ao exame; não se infere pelo nome. */
  questionnaireKey: ExamQuestionnaireKey;
}

/**
 * Lista fechada de exames permitidos (RN-03, HACK-17): única fonte da regra de
 * escopo. Código fora daqui é recusado com 422 `EXAM_NOT_ALLOWED`. Um ou dois
 * códigos por modelo de questionário do HACK-41.
 *
 * Pendência de go-live: nenhum código foi conferido na Terminologia 22 oficial
 * da ANS; as fontes abaixo são tabelas TUSS públicas de terceiros. A TUSS não
 * separa TC/RM com e sem contraste no mesmo segmento: o "sem contraste" vem do
 * questionário ligado, não do código.
 */
export const allowedExams: readonly AllowedExam[] = [
  // Fonte: https://tuss.clinica.work/ultrasonografia/ - "Abdome total (inclui abdome inferior)"
  {
    tussCode: '40901122',
    name: 'Ultrassonografia de abdome total',
    questionnaireKey: 'us-abdomen',
  },
  // Fonte: https://tuss.clinica.work/ultrasonografia/ - "Abdome superior (fígado, vias biliares, vesícula, pâncreas, baço)"
  {
    tussCode: '40901130',
    name: 'Ultrassonografia de abdome superior',
    questionnaireKey: 'us-abdomen',
  },
  // Fonte: https://tuss.clinica.work/ultrasonografia/ - "Abdome inferior feminino (bexiga, útero, ovário e anexos)"
  {
    tussCode: '40901181',
    name: 'Ultrassonografia pélvica feminina (via abdominal)',
    questionnaireKey: 'us-pelvis-transabdominal',
  },
  // Fonte: https://tuss.clinica.work/ultrasonografia/ - "Órgãos superficiais (tireóide ou escroto ou pênis ou crânio)"
  {
    tussCode: '40901203',
    name: 'Ultrassonografia de tireoide',
    questionnaireKey: 'us-thyroid',
  },
  // Fonte: https://tuss.clinica.work/ultrasonografia/ - "Mamas"
  {
    tussCode: '40901114',
    name: 'Ultrassonografia de mamas',
    questionnaireKey: 'us-breast',
  },
  // Fonte: https://tuss.clinica.work/ultrasonografia/ - "Articular (por articulação)"
  {
    tussCode: '40901220',
    name: 'Ultrassonografia articular',
    questionnaireKey: 'us-musculoskeletal',
  },
  // Fonte: https://tuss.clinica.work/ultrasonografia/ - "Ecodopplercardiograma transtorácico"
  {
    tussCode: '40901106',
    name: 'Ecocardiograma transtorácico',
    questionnaireKey: 'echo-transthoracic',
  },
  // Fonte: https://tuss.clinica.work/metodos-diagnosticos-por-imagem/ - "Mamografia convencional bilateral"
  {
    tussCode: '40808033',
    name: 'Mamografia convencional bilateral',
    questionnaireKey: 'mammography',
  },
  // Fonte: https://tuss.clinica.work/metodos-diagnosticos-por-imagem/ - "Mamografia digital bilateral"
  {
    tussCode: '40808041',
    name: 'Mamografia digital bilateral',
    questionnaireKey: 'mammography',
  },
  // Fonte: https://tuss.clinica.work/tomografia-computadorizada/ - "Crânio ou sela túrcica ou órbitas"
  {
    tussCode: '41001010',
    name: 'Tomografia de crânio sem contraste',
    questionnaireKey: 'ct-without-contrast',
  },
  // Fonte: https://tuss.clinica.work/ressonancia-magnetica/ - "Articular (por articulação)"
  {
    tussCode: '41101316',
    name: 'Ressonância magnética articular sem contraste',
    questionnaireKey: 'mri-without-contrast',
  },
];

const cents = z.int().min(1).max(10_000_000);

export const priceStepSchema = z.strictObject({
  /** Antecedência, em minutos, a partir da qual o desconto vale (RN-26). */
  leadMinutes: z.int().min(1).max(10_080),
  discountPercent: z.int().min(1).max(100),
});

export type PriceStepInput = z.infer<typeof priceStepSchema>;

const priceStepsSchema = z
  .array(priceStepSchema)
  .min(1)
  .max(5)
  .superRefine((steps, ctx) => {
    steps.forEach((step, index) => {
      if (
        steps.slice(0, index).some((s) => s.leadMinutes === step.leadMinutes)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'leadMinutes'],
          message: 'Dois degraus com a mesma antecedência.',
        });
      }
    });
  });

const contraindicationsSchema = z
  .array(screeningQuestionIdSchema)
  .max(10)
  .superRefine((ids, ctx) => {
    ids.forEach((id, index) => {
      if (ids.indexOf(id) !== index) {
        ctx.addIssue({
          code: 'custom',
          path: [index],
          message: 'Contraindicação repetida.',
        });
      }
    });
  });

/**
 * Corpo de `POST /api/clinic/exams` (HACK-17, porta 1). Nome e questionário
 * vêm da entrada de `allowedExams`, nunca do corpo. Piso ≤ preço cheio, TUSS na
 * lista e contraindicação do questionário são regras de dado do Nest (422 com
 * código próprio), não deste schema.
 */
export const examCreateBodySchema = z.strictObject({
  tussCode: z.string().regex(/^\d{8}$/),
  fullPriceCents: cents,
  floorPriceCents: cents,
  minLeadMinutes: z.int().min(0).max(10_080),
  preparationCondition: z.string().trim().min(1).max(500),
  preparationHours: z.int().min(0).max(72),
  contraindications: contraindicationsSchema,
  toleranceMinutes: z.int().min(1).max(120),
  maxTravelMinutes: z.int().min(1).max(240),
  priceSteps: priceStepsSchema,
});

export type ExamCreateBody = z.infer<typeof examCreateBodySchema>;

/** Corpo de `PUT /api/clinic/exams/:id` (porta 4): TUSS imutável, degraus trocados por inteiro. */
export const examUpdateBodySchema = examCreateBodySchema.omit({
  tussCode: true,
});

export type ExamUpdateBody = z.infer<typeof examUpdateBodySchema>;

/** Exame da clínica nas respostas de `POST`, `PUT` e `GET /api/clinic/exams`. */
export const examSchema = z.strictObject({
  id: z.uuid(),
  tussCode: z.string(),
  name: z.string(),
  fullPriceCents: z.int(),
  floorPriceCents: z.int(),
  minLeadMinutes: z.int(),
  preparationCondition: z.string(),
  preparationHours: z.int(),
  contraindications: z.array(screeningQuestionIdSchema),
  toleranceMinutes: z.int(),
  maxTravelMinutes: z.int(),
  priceSteps: z.array(
    z.strictObject({ leadMinutes: z.int(), discountPercent: z.int() }),
  ),
});

export type Exam = z.infer<typeof examSchema>;

export const examListSchema = z.strictObject({ exams: z.array(examSchema) });

export type ExamList = z.infer<typeof examListSchema>;

/** Item de `GET /api/clinic/exam-catalog`: o que a tela precisa para montar o formulário. */
export const examCatalogItemSchema = z.strictObject({
  tussCode: z.string(),
  name: z.string(),
  questionnaireKey: examQuestionnaireKeySchema,
  preparation: z.strictObject({
    condition: z.string(),
    hoursBefore: z.number(),
  }),
  contraindicationOptions: z.array(
    z.strictObject({ id: screeningQuestionIdSchema, question: z.string() }),
  ),
});

export type ExamCatalogItem = z.infer<typeof examCatalogItemSchema>;

export const examCatalogSchema = z.strictObject({
  items: z.array(examCatalogItemSchema),
});

export type ExamCatalog = z.infer<typeof examCatalogSchema>;

/** Sinal (RN-40) e teto diário de vagas com desconto (RN-28) da clínica. */
export const clinicSettingsSchema = z.strictObject({
  depositPercent: z.int().min(1).max(100),
  dailyDiscountCap: z.int().min(0).max(100),
});

export type ClinicSettings = z.infer<typeof clinicSettingsSchema>;

/** Corpo do 422 `EXAM_NOT_ALLOWED`: o erro de campo com a lista aceita. */
export const examErrorBodySchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  fields: z.array(z.string()).optional(),
  allowedExams: z
    .array(z.object({ tussCode: z.string(), name: z.string() }))
    .optional(),
});

export type ExamErrorBody = z.infer<typeof examErrorBodySchema>;

/** Padrões da spec pré-preenchidos na tela (F2); a API não aplica padrão. */
export const examFormDefaults = {
  toleranceMinutes: 15,
  maxTravelMinutes: 45,
  priceSteps: [
    { leadMinutes: 2880, discountPercent: 10 },
    { leadMinutes: 1440, discountPercent: 20 },
    { leadMinutes: 360, discountPercent: 30 },
  ],
  depositPercent: 20,
  dailyDiscountCap: 5,
} as const;
