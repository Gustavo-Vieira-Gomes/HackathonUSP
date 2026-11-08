import {
  type Exam,
  type ExamCatalogItem,
  examFormDefaults,
} from '@hackathon/contracts';

/** Degrau como a clínica digita: antecedência em horas e desconto em %. */
export interface StepForm {
  hours: string;
  discountPercent: string;
}

export interface ContraindicationOption {
  id: string;
  question: string;
}

/** Estado do formulário: texto dos campos, como digitado. */
export interface ExamFormValues {
  tussCode: string;
  fullPrice: string;
  floorPrice: string;
  minLeadHours: string;
  preparationCondition: string;
  preparationHours: string;
  contraindications: string[];
  /** Opções do questionário do exame escolhido (só leitura). */
  contraindicationOptions: ContraindicationOption[];
  toleranceMinutes: string;
  maxTravelMinutes: string;
  priceSteps: StepForm[];
}

const REAIS = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/;

/** `'1.234,56'` → `123456`; texto que não é valor em reais → `null`. */
export function reaisToCents(text: string): number | null {
  const value = text.trim();
  if (!REAIS.test(value)) return null;
  const [whole = '', fraction = ''] = value.replace(/\./g, '').split(',');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** `72000` → `'720,00'` (sem separador de milhar, como a clínica digita). */
export function centsToReais(cents: number): string {
  const whole = Math.floor(cents / 100);
  return `${whole},${String(cents % 100).padStart(2, '0')}`;
}

export const hoursToMinutes = (hours: number): number => hours * 60;
export const minutesToHours = (minutes: number): number => minutes / 60;

/** Inteiro digitado; outra coisa vira `null` e o servidor responde 422 no campo. */
function toInt(text: string): number | null {
  const value = text.trim();
  return /^-?\d+$/.test(value) ? Number(value) : null;
}

const multiply = (value: number | null, by: number) =>
  value === null ? null : value * by;

const stepsFromDefaults = (): StepForm[] =>
  examFormDefaults.priceSteps.map((step) => ({
    hours: String(minutesToHours(step.leadMinutes)),
    discountPercent: String(step.discountPercent),
  }));

/** Formulário de cadastro com os padrões da spec (`examFormDefaults`), sem exame escolhido. */
export function initialExamForm(): ExamFormValues {
  return {
    tussCode: '',
    fullPrice: '',
    floorPrice: '',
    minLeadHours: '',
    preparationCondition: '',
    preparationHours: '',
    contraindications: [],
    contraindicationOptions: [],
    toleranceMinutes: String(examFormDefaults.toleranceMinutes),
    maxTravelMinutes: String(examFormDefaults.maxTravelMinutes),
    priceSteps: stepsFromDefaults(),
  };
}

/** Escolha do exame: preparo do catálogo (editável) e as contraindicações do questionário. */
export function applyCatalogItem(
  form: ExamFormValues,
  item: ExamCatalogItem,
): ExamFormValues {
  return {
    ...form,
    tussCode: item.tussCode,
    preparationCondition: item.preparation.condition,
    preparationHours: String(item.preparation.hoursBefore),
    contraindications: [],
    contraindicationOptions: item.contraindicationOptions,
  };
}

/** Exame gravado → formulário de edição (reais e horas). */
export function examToFormValues(
  exam: Exam,
  item?: ExamCatalogItem,
): ExamFormValues {
  return {
    tussCode: exam.tussCode,
    fullPrice: centsToReais(exam.fullPriceCents),
    floorPrice: centsToReais(exam.floorPriceCents),
    minLeadHours: String(minutesToHours(exam.minLeadMinutes)),
    preparationCondition: exam.preparationCondition,
    preparationHours: String(exam.preparationHours),
    contraindications: [...exam.contraindications],
    contraindicationOptions: item?.contraindicationOptions ?? [],
    toleranceMinutes: String(exam.toleranceMinutes),
    maxTravelMinutes: String(exam.maxTravelMinutes),
    priceSteps: exam.priceSteps.map((step) => ({
      hours: String(minutesToHours(step.leadMinutes)),
      discountPercent: String(step.discountPercent),
    })),
  };
}

/**
 * Corpo do `POST` (`create`) ou do `PUT` (`update`, sem `tussCode`). Valor que
 * não converte vai como `null`: quem valida é o servidor (422 com o campo).
 */
export function toExamBody(
  values: ExamFormValues,
  mode: 'create' | 'update',
): Record<string, unknown> {
  const body = {
    fullPriceCents: reaisToCents(values.fullPrice),
    floorPriceCents: reaisToCents(values.floorPrice),
    minLeadMinutes: multiply(toInt(values.minLeadHours), 60),
    preparationCondition: values.preparationCondition,
    preparationHours: toInt(values.preparationHours),
    contraindications: values.contraindications,
    toleranceMinutes: toInt(values.toleranceMinutes),
    maxTravelMinutes: toInt(values.maxTravelMinutes),
    priceSteps: values.priceSteps.map((step) => ({
      leadMinutes: multiply(toInt(step.hours), 60),
      discountPercent: toInt(step.discountPercent),
    })),
  };
  return mode === 'create' ? { tussCode: values.tussCode, ...body } : body;
}
