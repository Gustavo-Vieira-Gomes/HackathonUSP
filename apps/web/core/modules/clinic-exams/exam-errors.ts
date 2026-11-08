import { examErrorBodySchema } from '@hackathon/contracts';

/** Ordem dos campos na tela (caminhos da API): o foco vai para o primeiro com erro. */
const FIELD_ORDER = [
  'tussCode',
  'fullPriceCents',
  'floorPriceCents',
  'priceSteps',
  'minLeadMinutes',
  'preparationCondition',
  'preparationHours',
  'contraindications',
  'toleranceMinutes',
  'maxTravelMinutes',
  'depositPercent',
  'dailyDiscountCap',
];

const FIELD_MESSAGES: Record<string, string> = {
  tussCode: 'Escolha um exame da lista.',
  fullPriceCents:
    'Informe o preço cheio em reais, entre R$ 0,01 e R$ 100.000,00.',
  floorPriceCents: 'Informe o piso em reais, entre R$ 0,01 e R$ 100.000,00.',
  minLeadMinutes: 'Informe a antecedência mínima em horas inteiras, até 168.',
  preparationCondition: 'Descreva o preparo (até 500 caracteres).',
  preparationHours: 'Informe as horas de preparo, de 0 a 72.',
  contraindications: 'Confira as contraindicações marcadas.',
  toleranceMinutes: 'A tolerância de atraso vai de 1 a 120 minutos.',
  maxTravelMinutes: 'O tempo máximo para chegar vai de 1 a 240 minutos.',
  priceSteps: 'Informe de 1 a 5 degraus, cada um com antecedência diferente.',
  leadMinutes: 'Antecedência em horas inteiras, de 1 a 168, sem repetir.',
  discountPercent: 'Desconto de 1% a 100%.',
  depositPercent: 'O sinal vai de 1% a 100%.',
  dailyDiscountCap: 'O teto diário vai de 0 a 100 vagas.',
};

const RULE_MESSAGES: Record<string, string> = {
  FLOOR_ABOVE_FULL_PRICE: 'piso deve ser menor ou igual ao preço cheio',
  EXAM_NOT_ALLOWED: 'Exame fora do escopo da plataforma.',
  TUSS_ALREADY_REGISTERED: 'Este exame já está cadastrado na clínica.',
  CONTRAINDICATION_NOT_IN_QUESTIONNAIRE:
    'Esta contraindicação não é do questionário deste exame.',
};

export const UNAVAILABLE_MESSAGE =
  'Não foi possível salvar agora. Tente de novo em instantes.';

export interface ExamFormErrorView {
  /** Mensagem por caminho da API (`floorPriceCents`, `priceSteps.1.leadMinutes`…). */
  fieldErrors: Record<string, string>;
  general?: string;
  firstField?: string;
  /** Nomes aceitos, no 422 `EXAM_NOT_ALLOWED`. */
  allowedExamNames?: string[];
  /** 404 na edição: a lista precisa ser recarregada. */
  reload?: boolean;
}

const rank = (path: string) => {
  const index = FIELD_ORDER.indexOf(path.split('.')[0] ?? '');
  return index === -1 ? FIELD_ORDER.length : index;
};

/** Mensagem do campo: regra do código, depois a do último segmento, depois a do campo. */
function messageFor(code: string | undefined, path: string): string {
  const segments = path.split('.');
  return (
    RULE_MESSAGES[code ?? ''] ??
    FIELD_MESSAGES[segments[segments.length - 1] ?? ''] ??
    FIELD_MESSAGES[segments[0] ?? ''] ??
    'Confira este campo.'
  );
}

/**
 * Traduz a resposta de erro de `POST`/`PUT /api/clinic/exams` e de
 * `PATCH /api/clinic/settings` para a tela: 422 com `fields` vira mensagem junto
 * de cada campo; 404 vira aviso e recarga; o resto vira indisponibilidade.
 */
export function examFormErrorView(
  status: number,
  body: unknown,
): ExamFormErrorView {
  if (status === 404) {
    return {
      fieldErrors: {},
      general: 'Este exame não foi encontrado. A lista foi atualizada.',
      reload: true,
    };
  }
  if (status !== 422) {
    return { fieldErrors: {}, general: UNAVAILABLE_MESSAGE };
  }
  const parsed = examErrorBodySchema.safeParse(body);
  const error = parsed.success ? parsed.data : {};
  const fields = [...(error.fields ?? [])].sort((a, b) => rank(a) - rank(b));
  const fieldErrors: Record<string, string> = {};
  for (const path of fields) fieldErrors[path] = messageFor(error.code, path);
  const view: ExamFormErrorView = { fieldErrors };
  if (error.code === 'EXAM_NOT_ALLOWED' && error.allowedExams) {
    view.allowedExamNames = error.allowedExams.map((exam) => exam.name);
  }
  if (fields[0]) view.firstField = fields[0];
  else view.general = error.message ?? UNAVAILABLE_MESSAGE;
  return view;
}
