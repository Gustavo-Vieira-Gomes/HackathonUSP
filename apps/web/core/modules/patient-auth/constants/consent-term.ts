import { CONSENT_TERM_VERSION } from '@hackathon/contracts';

/**
 * Termo de consentimento para dados de saúde (RN-11).
 * PENDÊNCIA (.specs/project/STATE.md): o texto jurídico definitivo ainda não
 * foi fornecido. Este é um placeholder sem redação jurídica e bloqueia go-live.
 */
export const CONSENT_TERM = {
  version: CONSENT_TERM_VERSION,
  title: 'Termo de consentimento para tratamento de dados de saúde',
  placeholderNotice: 'TEXTO PROVISÓRIO - termo jurídico pendente',
  paragraphs: [
    'Este espaço receberá o texto definitivo do termo de consentimento para tratamento de dados de saúde, conforme a LGPD.',
    'O texto jurídico ainda não foi redigido. Esta versão serve apenas para demonstração e não deve ser usada com dados reais de pacientes.',
  ],
  checkboxLabel:
    'Li e aceito o termo de consentimento para tratamento de dados de saúde',
} as const;
