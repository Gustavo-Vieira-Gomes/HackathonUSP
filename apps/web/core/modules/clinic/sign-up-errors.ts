import {
  type ClinicOpeningHours,
  fieldErrorSchema,
} from '@hackathon/contracts';

/** Ordem dos campos na tela: o foco vai para o primeiro com erro. */
export const FIELD_ORDER = [
  'name',
  'cnes',
  'technicalManager',
  'address',
  'email',
  'password',
  'openingHours',
  ...[0, 1, 2, 3, 4, 5, 6].flatMap((day) => [`open-${day}`, `close-${day}`]),
] as const;

const FIELD_MESSAGES: Record<string, string> = {
  name: 'Informe o nome da clínica.',
  cnes: 'O CNES tem exatamente 7 dígitos.',
  technicalManager: 'Informe o nome e o CRM do responsável técnico.',
  address: 'Informe o endereço completo (rua, número e cidade).',
  email: 'Informe um e-mail válido.',
  password: 'A senha precisa ter de 8 a 128 caracteres.',
  openingHours: 'Marque pelo menos um dia aberto.',
};

const RULE_MESSAGES: Record<string, string> = {
  CNES_TAKEN: 'Este CNES já está cadastrado.',
  ADDRESS_NOT_FOUND: 'Endereço não encontrado. Confira rua, número e cidade.',
};

const HOURS_MESSAGE =
  'Confira o horário: o fechamento deve ser depois da abertura.';

const UNAVAILABLE_STATUSES = new Set([429, 502, 503, 504]);

export interface SignUpErrorView {
  /** Mensagem por campo da tela (`cnes`, `open-3`…). */
  fieldErrors: Record<string, string>;
  /** Mensagem geral, fora de um campo. */
  general?: string;
  firstField?: string;
}

/**
 * Traduz a resposta de erro de `POST /api/sign-up/clinica` para a tela. `fields`
 * da API vira mensagem junto do campo; `openingHours.<i>.*` aponta para o dia da
 * faixa `i` enviada. 429/502/503/504 viram aviso de indisponibilidade.
 */
export function signUpErrorView(
  status: number,
  body: unknown,
  submitted: ClinicOpeningHours[],
): SignUpErrorView {
  if (UNAVAILABLE_STATUSES.has(status)) {
    return {
      fieldErrors: {},
      general:
        status === 429
          ? 'Muitas tentativas seguidas. Tente de novo em instantes.'
          : 'O serviço está indisponível no momento. Tente de novo em instantes.',
    };
  }
  const parsed = fieldErrorSchema.safeParse(body);
  const error = parsed.success ? parsed.data : {};
  const fieldErrors: Record<string, string> = {};

  if (status === 422) {
    for (const path of error.fields ?? []) {
      const [field, index, part] = path.split('.');
      if (field === 'openingHours' && index !== undefined) {
        const weekday = submitted[Number(index)]?.weekday;
        if (weekday === undefined) {
          fieldErrors.openingHours = HOURS_MESSAGE;
          continue;
        }
        const key =
          part === 'endMinute' ? `close-${weekday}` : `open-${weekday}`;
        fieldErrors[key] =
          part === 'startMinute'
            ? 'Faixa inválida ou sobreposta neste dia.'
            : HOURS_MESSAGE;
        continue;
      }
      if (field === undefined) continue;
      const message =
        RULE_MESSAGES[error.code ?? ''] ??
        FIELD_MESSAGES[field] ??
        'Confira este campo.';
      fieldErrors[field] = message;
    }
    // E-mail repetido vem do Better Auth, sem `fields`.
    if (!error.fields?.length && /EXIST/i.test(error.code ?? '')) {
      fieldErrors.email = 'Já existe uma conta com este e-mail.';
    }
  }

  const firstField = FIELD_ORDER.find((field) => field in fieldErrors);
  if (firstField) return { fieldErrors, firstField };
  return {
    fieldErrors,
    general:
      error.message && status === 422
        ? error.message
        : 'Não foi possível concluir o cadastro. Tente de novo em instantes.',
  };
}
