import 'server-only';
import type {
  ClinicSettings,
  Exam,
  ExamCatalogItem,
  SessionUser,
} from '@hackathon/contracts';
import { getSessionUser } from '@/core/shared/services/session.service';
import {
  getClinicExams,
  getClinicSettings,
  getExamCatalog,
  type ReadResult,
} from './clinic-exams.service';

export type ExamsPage =
  | { kind: 'redirect'; to: '/clinica/login' }
  | { kind: 'not-clinic' }
  | {
      kind: 'page';
      exams: Exam[];
      catalog: ExamCatalogItem[];
      settings: ClinicSettings;
    }
  | { kind: 'error' };

interface ExamsPageDeps {
  getSessionUser: (cookie: string) => Promise<SessionUser | null>;
  getClinicExams: (cookie: string) => Promise<ReadResult<Exam[]>>;
  getExamCatalog: (cookie: string) => Promise<ReadResult<ExamCatalogItem[]>>;
  getClinicSettings: (cookie: string) => Promise<ReadResult<ClinicSettings>>;
}

/**
 * Decide o que `/clinica/exames` mostra: sem sessão → login; paciente → aviso, sem
 * chamar a API de clínica; clínica → as três leituras, ou indisponibilidade se
 * qualquer uma falhar.
 */
export async function loadExamsPage(
  cookieHeader: string,
  deps: ExamsPageDeps = {
    getSessionUser,
    getClinicExams,
    getExamCatalog,
    getClinicSettings,
  },
): Promise<ExamsPage> {
  const user = await deps.getSessionUser(cookieHeader);
  if (!user) return { kind: 'redirect', to: '/clinica/login' };
  if (user.role !== 'clinica') return { kind: 'not-clinic' };
  const [exams, catalog, settings] = await Promise.all([
    deps.getClinicExams(cookieHeader),
    deps.getExamCatalog(cookieHeader),
    deps.getClinicSettings(cookieHeader),
  ]);
  if (
    [exams, catalog, settings].some(
      (result) =>
        !result.ok && (result.status === 401 || result.status === 403),
    )
  )
    return { kind: 'redirect', to: '/clinica/login' };
  if (!exams.ok || !catalog.ok || !settings.ok) return { kind: 'error' };
  return {
    kind: 'page',
    exams: exams.data,
    catalog: catalog.data,
    settings: settings.data,
  };
}
