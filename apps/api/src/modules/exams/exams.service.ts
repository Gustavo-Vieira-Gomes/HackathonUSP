import {
  type AllowedExam,
  allowedExams,
  type ClinicSettings,
  type Exam,
  type ExamCatalog,
  type ExamCreateBody,
  type ExamList,
  type ExamUpdateBody,
  examSchema,
} from '@hackathon/contracts';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { fieldError } from '../../common/pipes/zod-body.pipe';
import { isUniqueViolation } from '../../prisma/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { examQuestionnairesSeed } from './exam-questionnaires.seed';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const examSelect = {
  id: true,
  tussCode: true,
  name: true,
  fullPriceCents: true,
  floorPriceCents: true,
  minLeadMinutes: true,
  preparationCondition: true,
  preparationHours: true,
  contraindications: true,
  toleranceMinutes: true,
  maxTravelMinutes: true,
  priceSteps: {
    select: { leadMinutes: true, discountPercent: true },
    orderBy: { leadMinutes: 'desc' },
  },
} as const;

const notFound = () =>
  new NotFoundException({
    code: 'NOT_FOUND',
    message: 'Exame não encontrado.',
  });

function questionnaireOf(key: AllowedExam['questionnaireKey']) {
  const questionnaire = examQuestionnairesSeed.find((q) => q.key === key);
  if (!questionnaire) {
    throw new Error(`Exame permitido sem questionário no catálogo: ${key}.`);
  }
  return questionnaire;
}

/**
 * Dono do cadastro de exames da clínica (HACK-17, porta 3). Toda consulta filtra
 * pelo `clinicId` da sessão. As regras de dado (lista fechada, piso, contraindicação
 * do questionário, TUSS repetido) respondem 422 com código próprio (porta 2);
 * a conta do preço continua só no motor do HACK-30.
 */
@Injectable()
export class ExamsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clinicId: string): Promise<ExamList> {
    const rows = await this.prisma.exam.findMany({
      where: { clinicId },
      select: examSelect,
      orderBy: [{ name: 'asc' }, { tussCode: 'asc' }],
    });
    return { exams: rows.map((row) => examSchema.parse(row)) };
  }

  catalog(): ExamCatalog {
    return {
      items: allowedExams.map((exam) => {
        const questionnaire = questionnaireOf(exam.questionnaireKey);
        return {
          tussCode: exam.tussCode,
          name: exam.name,
          questionnaireKey: exam.questionnaireKey,
          preparation: {
            condition: questionnaire.preparation.condition,
            hoursBefore: questionnaire.preparation.hoursBefore,
          },
          contraindicationOptions: questionnaire.contraindications.map(
            ({ id, question }) => ({ id, question }),
          ),
        };
      }),
    };
  }

  async create(clinicId: string, body: ExamCreateBody): Promise<Exam> {
    const allowed = allowedExams.find(
      (exam) => exam.tussCode === body.tussCode,
    );
    if (!allowed) {
      throw new UnprocessableEntityException({
        code: 'EXAM_NOT_ALLOWED',
        message: `Exame fora do escopo. Exames aceitos: ${allowedExams
          .map((exam) => exam.name)
          .join(', ')}.`,
        fields: ['tussCode'],
        allowedExams: allowedExams.map(({ tussCode, name }) => ({
          tussCode,
          name,
        })),
      });
    }
    const questionnaire = questionnaireOf(allowed.questionnaireKey);
    this.assertDataRules(body, questionnaire);
    const { priceSteps, ...fields } = body;
    try {
      const row = await this.prisma.exam.create({
        data: {
          ...fields,
          clinicId,
          name: allowed.name,
          questionnaireKey: questionnaire.key,
          questionnaireVersion: questionnaire.version,
          priceSteps: { createMany: { data: priceSteps } },
        },
        select: examSelect,
      });
      return examSchema.parse(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw fieldError(
          'TUSS_ALREADY_REGISTERED',
          'Este exame já está cadastrado na clínica.',
          ['tussCode'],
        );
      }
      throw error;
    }
  }

  /**
   * Edição com TUSS imutável (porta 4). O `UPDATE` da linha de `Exam` vem primeiro
   * na transação e trava a linha, então duas edições simultâneas trocam os degraus
   * uma depois da outra, sem mistura.
   */
  async update(
    clinicId: string,
    id: string,
    body: ExamUpdateBody,
  ): Promise<Exam> {
    if (!UUID.test(id)) throw notFound();
    const current = await this.prisma.exam.findFirst({
      where: { id, clinicId },
      select: { questionnaireKey: true },
    });
    if (!current) throw notFound();
    const questionnaire = questionnaireOf(
      current.questionnaireKey as AllowedExam['questionnaireKey'],
    );
    this.assertDataRules(body, questionnaire);
    const { priceSteps, ...fields } = body;
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.exam.updateMany({
        where: { id, clinicId },
        data: fields,
      });
      if (updated.count === 0) throw notFound();
      await tx.priceStep.deleteMany({ where: { examId: id } });
      await tx.priceStep.createMany({
        data: priceSteps.map((step) => ({ ...step, examId: id })),
      });
      return tx.exam.findUniqueOrThrow({ where: { id }, select: examSelect });
    });
    return examSchema.parse(row);
  }

  async settings(clinicId: string): Promise<ClinicSettings> {
    return this.prisma.clinic.findUniqueOrThrow({
      where: { id: clinicId },
      select: { depositPercent: true, dailyDiscountCap: true },
    });
  }

  async updateSettings(
    clinicId: string,
    body: ClinicSettings,
  ): Promise<ClinicSettings> {
    return this.prisma.clinic.update({
      where: { id: clinicId },
      data: body,
      select: { depositPercent: true, dailyDiscountCap: true },
    });
  }

  private assertDataRules(
    body: ExamUpdateBody,
    questionnaire: ReturnType<typeof questionnaireOf>,
  ): void {
    if (body.floorPriceCents > body.fullPriceCents) {
      throw fieldError(
        'FLOOR_ABOVE_FULL_PRICE',
        'piso deve ser menor ou igual ao preço cheio',
        ['floorPriceCents'],
      );
    }
    const accepted = new Set(questionnaire.contraindications.map((c) => c.id));
    const outside = body.contraindications.flatMap((id, index) =>
      accepted.has(id) ? [] : [`contraindications.${index}`],
    );
    if (outside.length > 0) {
      throw fieldError(
        'CONTRAINDICATION_NOT_IN_QUESTIONNAIRE',
        `Contraindicação fora do questionário de ${questionnaire.name}.`,
        outside,
      );
    }
  }
}
